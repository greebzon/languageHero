import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_MECHANICS,
  CHOICE_PRESET_KEYS,
  CHOICE_PRESETS,
  catalogForMechanics,
  choicePresetOf,
  courseLessonSchema,
  exerciseCountsOf,
  exerciseWords,
  mapExerciseWords,
  releaseSchema,
  visibleCatalog,
  type Answer,
  type CourseExercise,
  type CourseLesson,
} from '@lingvohero/contracts';
import { birthYearFor, difficultyFor } from './age';
import { solveExercise } from './mechanics';
import {
  assess,
  currentExercise,
  inReview,
  learn,
  newLearningState,
  playableIndices,
  restoreLearningState,
} from './course';
import data from '../../../content/seed.json';

const release = releaseSchema.parse(data);
const seedLesson = release.lessons[0]!; // words: fox, bear, rabbit, owl

const text = { prompt: 'Выбери', hint: 'Подумай' };
const choices: CourseExercise[] = [
  {
    id: 'find',
    type: 'choice',
    ...text,
    show: [{ view: 'text', wordId: 'fox' }],
    as: 'image',
    options: ['fox', 'bear', 'owl'].map((w) => ({ id: w, wordId: w })),
    answerId: 'fox',
  },
  {
    id: 'name',
    type: 'choice',
    ...text,
    show: [{ view: 'image', wordId: 'bear' }],
    as: 'text',
    options: ['fox', 'bear'].map((w) => ({ id: w, wordId: w })),
    answerId: 'bear',
  },
  {
    id: 'translate',
    type: 'choice',
    ...text,
    show: [{ view: 'translation', wordId: 'owl' }],
    as: 'text',
    options: ['owl', 'rabbit', 'fox'].map((w) => ({ id: w, wordId: w })),
    answerId: 'owl',
  },
  {
    id: 'is-it',
    type: 'choice',
    ...text,
    show: [
      { view: 'image', wordId: 'rabbit' },
      { view: 'text', wordId: 'bear' },
    ],
    as: 'yes-no',
    options: [{ id: 'yes' }, { id: 'no' }],
    answerId: 'no',
  },
  {
    id: 'first-sound',
    type: 'choice',
    ...text,
    show: [
      { view: 'image', wordId: 'fox' },
      { view: 'audio', wordId: 'fox' },
    ],
    as: 'letter',
    options: ['f', 'b', 'o'].map((letter, i) => ({ id: `l${i}`, letter })),
    answerId: 'l0',
  },
  {
    id: 'odd',
    type: 'choice',
    ...text,
    show: [],
    as: 'image',
    options: ['fox', 'bear', 'rabbit', 'owl'].map((w) => ({ id: w, wordId: w })),
    answerId: 'owl',
  },
];
const lesson = (exercises: CourseExercise[]): CourseLesson => ({
  ...seedLesson,
  texts: undefined,
  exercises,
});
const parses = (exercises: CourseExercise[]) =>
  courseLessonSchema.safeParse(lesson(exercises)).success;

test('every choice preset is valid, solvable and recognised', () => {
  const pkg = courseLessonSchema.parse(lesson(choices));
  let state = learn(newLearningState(), { type: 'start', lesson: pkg });
  for (const ex of choices) {
    assert.equal(ex.type, 'choice');
    if (ex.type !== 'choice') continue;
    const wrong = ex.options.find((o) => o.id !== ex.answerId)!.id;
    assert.equal(assess(ex, { choiceId: wrong }, pkg), 'wrong');
    assert.equal(assess(ex, { choiceId: 'nope' }, pkg), 'invalid');
    assert.equal(assess(ex, { pairs: {} }, pkg), 'invalid');
    state = learn(state, { type: 'draft', answer: { choiceId: ex.answerId } });
    state = learn(state, { type: 'answer' });
    assert.ok(state.session!.correct, ex.id);
    state = learn(state, { type: 'next' });
  }
  assert.ok(state.session!.finished);
  assert.equal(state.session!.mistakes, 0);
  assert.deepEqual(
    choices.map((ex) => ex.type === 'choice' && choicePresetOf(ex)),
    ['find-picture', 'name-picture', 'translate', 'is-it', 'first-sound', 'odd-one-out'],
  );
  assert.deepEqual(
    CHOICE_PRESET_KEYS.filter((k) => !CHOICE_PRESETS[k].generated),
    ['odd-one-out'],
  );
});

test('choice checks reject answers that contradict the question', () => {
  const [find, , , isIt, firstSound] = choices as Extract<CourseExercise, { type: 'choice' }>[];
  // «Is this a bear?» under a rabbit is «no».
  assert.equal(parses([{ ...isIt!, answerId: 'yes' }]), false);
  assert.equal(parses([{ ...isIt!, show: [isIt!.show[0]!] }]), false);
  // The answer to «find fox» must be the fox picture.
  assert.equal(parses([{ ...find!, answerId: 'bear' }]), false);
  assert.equal(
    parses([{ ...find!, options: [...find!.options, { id: 'x', wordId: 'fox' }] }]),
    false,
  );
  assert.equal(parses([{ ...find!, show: [{ view: 'text', wordId: 'cat' }] }]), false);
  assert.equal(
    parses([{ ...firstSound!, options: [...firstSound!.options, { id: 'l9', letter: 'f' }] }]),
    false,
  );
  assert.equal(parses([{ ...firstSound!, show: [] }]), false);
  assert.equal(parses([{ ...find!, answerId: 'missing' }]), false);
});

test('mechanics report and remap the words they use', () => {
  const [find, , , isIt, , odd] = choices;
  assert.deepEqual(exerciseWords(find!), ['fox']);
  assert.deepEqual(exerciseWords(isIt!), ['rabbit', 'bear']);
  assert.deepEqual(exerciseWords(odd!), ['fox', 'bear', 'rabbit', 'owl']);
  const upper = mapExerciseWords(find!, (id) => `${id}-2`);
  assert.ok(upper.type === 'choice');
  assert.deepEqual(upper.show, [{ view: 'text', wordId: 'fox-2' }]);
  assert.deepEqual(
    upper.options.map((o) => o.wordId),
    ['fox-2', 'bear-2', 'owl-2'],
  );
  for (const ex of seedLesson.exercises)
    assert.ok(exerciseWords(ex).every((w) => seedLesson.words.some((x) => x.id === w)));
});

test('a client gets only the lessons whose mechanics it can show', () => {
  const { catalog } = release;
  assert.equal(catalogForMechanics(catalog, BASE_MECHANICS), catalog);
  const noSpelling = catalogForMechanics(catalog, ['listen-and-select', 'match-pairs']);
  assert.deepEqual(
    noSpelling.courses[0]!.lessons.map((l) => l.id),
    ['en-animals-01', 'en-animals-02', 'en-animals-03'],
  );
  assert.equal(catalogForMechanics(catalog, ['choice']).courses.length, 0);
  assert.equal(visibleCatalog(catalog, 'ru', ['choice']).courses.length, 0);
  assert.equal(visibleCatalog(catalog, 'ru'), catalog);
});

test('6–7-year-olds get fewer options and extra letters, always solvable and repeatable', () => {
  const young = { ageBand: '6-7' as const };
  const lessons = [...release.lessons, lesson(choices)];
  for (const pkg of lessons) {
    let state = learn(newLearningState(), {
      type: 'start',
      lesson: pkg,
      attemptId: '7d6f1a52-3c1e-4c55-9c1a-0e1f2a3b4c5d',
      difficulty: young,
    });
    const adapted: CourseExercise[] = [];
    while (!state.session!.finished) {
      const session = state.session!;
      const ex = currentExercise(session);
      assert.deepEqual(currentExercise(session), ex, 'the same seed eases the same way');
      // A session loaded from the server gets a new attempt id; the exercise must not change.
      assert.deepEqual(
        currentExercise({ ...session, attemptId: '0b6a3c1e-2d4f-4a5b-8c7d-9e0f1a2b3c4d' }),
        ex,
      );
      adapted.push(ex);
      if (ex.type === 'listen-and-select') assert.ok(ex.choices.length <= 3);
      if (ex.type === 'match-pairs') assert.ok(ex.wordIds.length <= 3);
      if (ex.type === 'choice' && ex.as !== 'yes-no') assert.ok(ex.options.length <= 3);
      if (ex.type === 'build-word') {
        const spelling = pkg.words.find((w) => w.id === ex.wordId)!.spelling;
        assert.ok(ex.tiles.length <= Array.from(spelling).length + 1);
      }
      state = learn(state, { type: 'draft', answer: answerTo(ex, pkg) });
      state = learn(state, { type: 'answer' });
      assert.ok(state.session!.correct, `${pkg.id}/${ex.id}`);
      state = learn(state, { type: 'next' });
    }
    // Eased exercises are still valid exercises of the lesson.
    assert.ok(courseLessonSchema.safeParse({ ...pkg, exercises: adapted }).success, pkg.id);
  }
  // Without an age, and for the older group, the lesson is played as published.
  const pkg = release.lessons[0]!;
  const easedFirst = currentExercise(
    learn(newLearningState(), { type: 'start', lesson: pkg, difficulty: young }).session!,
  );
  assert.ok(
    pkg.exercises[0]!.type === 'listen-and-select' && pkg.exercises[0]!.choices.length === 4,
  );
  assert.ok(easedFirst.type === 'listen-and-select' && easedFirst.choices.length === 3);
  for (const difficulty of [undefined, { ageBand: '8-9' as const }]) {
    const state = learn(newLearningState(), { type: 'start', lesson: pkg, difficulty });
    assert.deepEqual(currentExercise(state.session!), pkg.exercises[0]);
  }
  assert.equal(
    restoreLearningState(
      learn(newLearningState(), { type: 'start', lesson: pkg, difficulty: young }),
    )?.session?.difficulty?.ageBand,
    '6-7',
  );
});

test('the age group follows the birth year', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  assert.equal(difficultyFor(null, now), undefined);
  assert.equal(birthYearFor(6, now), 2020);
  assert.deepEqual(difficultyFor(birthYearFor(7, now), now), { ageBand: '6-7' });
  assert.deepEqual(difficultyFor(birthYearFor(8, now), now), { ageBand: '8-9' });
  assert.deepEqual(difficultyFor(2010, now), { ageBand: '8-9' });
});

const answerTo = (ex: CourseExercise, pkg: CourseLesson): Answer => solveExercise(ex, pkg);

const sentences = (): CourseLesson => {
  const audio = seedLesson.media.find((m) => m.kind === 'audio')!;
  return {
    ...seedLesson,
    texts: undefined,
    media: [...seedLesson.media, { ...audio, id: 's1-audio' }, { ...audio, id: 's2-audio' }],
    exercises: [
      {
        id: 'young',
        type: 'build-sentence',
        prompt: 'Собери фразу: «Я вижу лису»',
        hint: 'Начни с «I»',
        ageBands: ['6-7'],
        tokens: [
          { id: 't1', text: 'I' },
          { id: 't2', text: 'see' },
          { id: 't3', text: 'a' },
          { id: 't4', text: 'fox', wordId: 'fox' },
          { id: 't5', text: 'owl', wordId: 'owl' },
          { id: 't6', text: 'bear', wordId: 'bear' },
        ],
        answer: ['I', 'see', 'a', 'fox'],
        audioId: 's1-audio',
      },
      {
        id: 'older',
        type: 'build-sentence',
        prompt: 'Собери фразу: «Лиса и сова»',
        hint: 'Два раза «the»',
        ageBands: ['8-9'],
        tokens: [
          { id: 'a', text: 'the' },
          { id: 'b', text: 'owl', wordId: 'owl' },
          { id: 'c', text: 'and' },
          { id: 'd', text: 'The' },
          { id: 'e', text: 'fox', wordId: 'fox' },
          { id: 'f', text: 'a' },
        ],
        answer: ['the', 'fox', 'and', 'the', 'owl'],
        alternatives: [['the', 'owl', 'and', 'the', 'fox']],
        audioId: 's2-audio',
      },
    ],
  };
};

test('a sentence lesson: one task per age group, words compared by text, any right order', () => {
  const pkg = courseLessonSchema.parse(sentences());
  assert.deepEqual(playableIndices(pkg, { ageBand: '6-7' }), [0]);
  assert.deepEqual(playableIndices(pkg, { ageBand: '8-9' }), [1]);
  assert.deepEqual(playableIndices(pkg), [1]);
  assert.deepEqual(exerciseCountsOf(pkg), { '6-7': 1, '8-9': 1 });
  assert.equal(exerciseCountsOf(seedLesson), undefined);
  const older = pkg.exercises[1]!;
  // «the» tiles are interchangeable, case does not matter, the other order counts too.
  assert.equal(assess(older, { tileIds: ['d', 'e', 'c', 'a', 'b'] }, pkg), 'correct');
  assert.equal(assess(older, { tileIds: ['a', 'b', 'c', 'd', 'e'] }, pkg), 'correct');
  assert.equal(assess(older, { tileIds: ['a', 'e', 'c', 'f', 'b'] }, pkg), 'wrong');
  assert.equal(assess(older, { tileIds: ['a', 'a'] }, pkg), 'invalid');
  assert.equal(assess(older, { choiceId: 'a' }, pkg), 'invalid');
  assert.deepEqual(exerciseWords(older), ['owl', 'fox']);
  // A 6-year-old plays only the short sentence, with one extra word.
  let state = learn(newLearningState(), {
    type: 'start',
    lesson: pkg,
    difficulty: { ageBand: '6-7' },
  });
  const young = currentExercise(state.session!);
  assert.ok(young.type === 'build-sentence' && young.tokens.length === 5);
  state = learn(state, { type: 'draft', answer: { tileIds: ['t3', 't1', 't2', 't4'] } });
  state = learn(state, { type: 'answer' });
  assert.equal(state.session!.mistakes, 1);
  assert.equal(inReview(state.session!), false);
  state = learn(state, { type: 'draft', answer: answerTo(young, pkg) });
  state = learn(state, { type: 'answer' });
  state = learn(state, { type: 'next' });
  assert.equal(inReview(state.session!), true, 'the wrong one comes back');
  assert.ok(restoreLearningState(state), 'an age-filtered queue restores');
  // The schema checks the sentence can be built and every group has something to play.
  const broken = sentences();
  const first = broken.exercises[0]!;
  assert.ok(first.type === 'build-sentence');
  assert.equal(
    parsesLesson({
      ...broken,
      exercises: [{ ...first, answer: ['I', 'see', 'the', 'fox'] }, broken.exercises[1]!],
    }),
    false,
  );
  assert.equal(parsesLesson({ ...broken, exercises: [broken.exercises[0]!] }), false);
  assert.equal(
    parsesLesson({
      ...broken,
      exercises: [{ ...first, audioId: 'fox-image' }, broken.exercises[1]!],
    }),
    false,
  );
});

const parsesLesson = (lesson: CourseLesson) => courseLessonSchema.safeParse(lesson).success;

test('memory ends when every pair is found; catch-the-word replays taps and counts misses', () => {
  const pkg = courseLessonSchema.parse(
    lesson([
      {
        id: 'memory',
        type: 'memory',
        prompt: 'Мемори',
        hint: 'Запоминай',
        wordIds: ['fox', 'bear', 'owl', 'rabbit'],
        order: [
          'owl-text',
          'fox-image',
          'bear-text',
          'rabbit-image',
          'fox-text',
          'owl-image',
          'rabbit-text',
          'bear-image',
        ],
      },
      {
        id: 'catch',
        type: 'catch-word',
        prompt: 'Поймай',
        hint: 'Слушай',
        rounds: [
          { wordId: 'fox', choices: ['owl', 'fox', 'bear'] },
          { wordId: 'bear', choices: ['bear', 'rabbit'] },
        ],
      },
    ]),
  );
  const [game, arcade] = pkg.exercises;
  assert.ok(game?.type === 'memory' && arcade?.type === 'catch-word');
  assert.equal(assess(game!, { pairs: { fox: 'fox', bear: 'bear' } }, pkg), 'invalid');
  assert.equal(assess(game!, solveExercise(game!, pkg), pkg), 'correct');
  assert.equal(assess(arcade!, { taps: ['fox', 'bear'] }, pkg), 'correct');
  assert.equal(assess(arcade!, { taps: ['owl', 'fox', 'bear'] }, pkg), 'correct', 'one miss');
  assert.equal(assess(arcade!, { taps: ['owl', 'fox', 'rabbit', 'bear'] }, pkg), 'wrong');
  assert.equal(assess(arcade!, { taps: ['fox'] }, pkg), 'invalid', 'a round left');
  assert.equal(
    assess(arcade!, { taps: ['fox', 'owl', 'bear'] }, pkg),
    'invalid',
    'owl is not in round 2',
  );
  assert.equal(assess(arcade!, { taps: ['fox', 'bear', 'bear'] }, pkg), 'invalid', 'after the end');
  // A 6-year-old gets three pairs (six cards) and three bubbles at most.
  const state = learn(newLearningState(), {
    type: 'start',
    lesson: pkg,
    difficulty: { ageBand: '6-7' },
  });
  const eased = currentExercise(state.session!);
  assert.ok(eased.type === 'memory' && eased.wordIds.length === 3 && eased.order.length === 6);
  assert.ok(courseLessonSchema.safeParse({ ...pkg, exercises: [eased, arcade!] }).success);
  // Broken data is caught by the schema.
  assert.equal(parses([{ ...game!, order: game!.order.slice(1) } as CourseExercise]), false);
  assert.equal(
    parses([
      { ...arcade!, rounds: [{ wordId: 'fox', choices: ['owl', 'bear'] }] } as CourseExercise,
    ]),
    false,
  );
});
