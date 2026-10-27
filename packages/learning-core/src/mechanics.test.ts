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
  type CourseExercise,
  type CourseLesson,
} from '@lingvohero/contracts';
import { assess, learn, newLearningState } from './course';
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
