import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_MECHANICS,
  CHOICE_PRESET_KEYS,
  CHOICE_PRESETS,
  catalogForMechanics,
  choicePresetOf,
  courseLessonSchema,
  exerciseWords,
  mapExerciseWords,
  releaseSchema,
  visibleCatalog,
  type Answer,
  type CourseExercise,
  type CourseLesson,
} from '@lingvohero/contracts';
import { birthYearFor, difficultyFor } from './age';
import { assess, currentExercise, learn, newLearningState, restoreLearningState } from './course';
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

function answerTo(ex: CourseExercise, pkg: CourseLesson): Answer {
  if (ex.type === 'listen-and-select') return { choiceId: ex.wordId };
  if (ex.type === 'match-pairs')
    return { pairs: Object.fromEntries(ex.wordIds.map((id) => [id, id])) };
  if (ex.type === 'choice') return { choiceId: ex.answerId };
  const available = [...ex.tiles];
  return {
    tileIds: Array.from(pkg.words.find((w) => w.id === ex.wordId)!.spelling).map(
      (letter) =>
        available.splice(
          available.findIndex((t) => t.letter === letter),
          1,
        )[0]!.id,
    ),
  };
}
