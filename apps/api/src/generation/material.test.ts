import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choicePresetOf,
  generationInputSchema,
  type GenerationOutput,
} from '@lingvohero/contracts';
import { inspectMedia } from '../admin/media.js';
import { distribute, wordCountFor } from './distribute.js';
import {
  MaterialError,
  buildDocument,
  buildExercises,
  buildLessonPlans,
  buildVocabulary,
  lessonDtoSchema,
  planDtoSchema,
  toJsonSchema,
} from './dto.js';
import { fakePng, fakeWav } from './fake-media.js';
import { FakeProvider } from './fake-provider.js';
import { lessonPrompt, planPrompt, sentencesPrompt } from './prompts.js';
import {
  SENTENCES_PER_BAND,
  buildSentenceExercises,
  sentenceLessonPlan,
  sentencesDtoSchema,
} from './sentences.js';
import { classifyError, ProviderError } from './provider.js';
import { reviewMaterial } from './review.js';
import { wordLessonMix } from './mechanics/index.js';

test('fake media passes the same checks as uploads', () => {
  const png = inspectMedia(fakePng('fox'));
  assert.equal(png.kind, 'image');
  assert.deepEqual([png.width, png.height], [96, 96]);
  assert.notEqual(fakePng('fox').toString('hex'), fakePng('owl').toString('hex'));
  assert.deepEqual(fakePng('fox'), fakePng('fox'));
  const wav = inspectMedia(fakeWav('fox'));
  assert.equal(wav.kind, 'audio');
  assert.ok(wav.durationMs! >= 590 && wav.durationMs! <= 610);
});

test('strict JSON schemas: every property required, nothing extra', () => {
  for (const schema of [planDtoSchema, lessonDtoSchema, sentencesDtoSchema]) {
    const json = toJsonSchema(schema) as {
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
      $schema?: string;
    };
    assert.equal(json.$schema, undefined);
    assert.equal(json.additionalProperties, false);
    assert.deepEqual(json.required.sort(), Object.keys(json.properties).sort());
  }
});

test('fake provider material maps into valid lessons that pass review', async () => {
  const input = generationInputSchema.parse({
    topic: 'Зоопарк',
    totalExercises: 14,
    targetWords: ['fox', 'owl'],
  });
  const distribution = distribute(input.totalExercises, input.lessonSize);
  const provider = new FakeProvider();
  const context = { jobId: 'job', stage: 'plan' as const, targetId: 'plan' };
  const planPayload = {
    language: 'en',
    languageTitle: 'English',
    topic: input.topic,
    distribution,
    wordCount: wordCountFor(distribution, input.targetWords.length),
    targetWords: input.targetWords,
    existingWords: ['bear'],
    level: input.level,
    ageRange: input.ageRange,
    style: input.style,
  };
  const { system, user } = planPrompt(planPayload);
  const planResult = await provider.generateText({
    context,
    model: 'fake',
    schemaName: 'course_plan',
    schema: toJsonSchema(planDtoSchema),
    system,
    user,
    payload: planPayload,
  });
  assert.ok(planResult.ok);
  const dto = planDtoSchema.parse(planResult.data);
  const { words, keyMap } = buildVocabulary(dto, planPayload.wordCount);
  assert.equal(words.length, 8);
  assert.ok(words.some((w) => w.key === 'fox'));
  assert.equal(keyMap.get('fox'), 'fox');
  const lessons = buildLessonPlans(dto, words, distribution, 'en-zoo', keyMap);
  assert.deepEqual(
    lessons.map((l) => l.lessonId),
    ['en-zoo-01', 'en-zoo-02'],
  );
  for (const lesson of lessons) {
    const payload = {
      language: 'en',
      languageTitle: 'English',
      topic: input.topic,
      lesson,
      words,
      exerciseCount: lesson.exerciseCount,
      mix: wordLessonMix(input.mix),
      feedback: null,
    };
    const prompt = lessonPrompt(payload);
    const result = await provider.generateText({
      context: { ...context, stage: 'text', targetId: lesson.lessonId },
      model: 'fake',
      schemaName: 'lesson_exercises',
      schema: toJsonSchema(lessonDtoSchema),
      system: prompt.system,
      user: prompt.user,
      payload,
    });
    assert.ok(result.ok);
    const exercises = buildExercises(
      lessonDtoSchema.parse(result.data),
      lesson,
      words,
      keyMap,
      wordLessonMix(input.mix),
    );
    lesson.document = buildDocument(lesson, words, exercises);
  }
  const output: GenerationOutput = { words, lessons, distribution };
  assert.deepEqual(reviewMaterial(output, input, 'en'), []);
  const total = lessons.reduce((s, l) => s + l.document!.exercises.length, 0);
  assert.equal(total, 14);
  const tiles = lessons[0]!.document!.exercises.find((e) => e.type === 'build-word');
  assert.ok(tiles && tiles.type === 'build-word' && tiles.tiles.length >= 4);

  // «Выбор»: every variant the model may pick becomes a valid, solvable exercise.
  const choiceLesson = { ...structuredClone(lessons[0]!), exerciseCount: 5 };
  const choicePayload = {
    language: 'en',
    languageTitle: 'English',
    topic: input.topic,
    lesson: choiceLesson,
    words,
    exerciseCount: 5,
    mix: ['choice' as const],
    feedback: null,
  };
  const choiceResult = await provider.generateText({
    context: { ...context, stage: 'text', targetId: 'choice' },
    model: 'fake',
    schemaName: 'lesson_exercises',
    schema: toJsonSchema(lessonDtoSchema),
    ...lessonPrompt(choicePayload),
    payload: choicePayload,
  });
  assert.ok(choiceResult.ok);
  const choices = buildExercises(
    lessonDtoSchema.parse(choiceResult.data),
    choiceLesson,
    words,
    keyMap,
    ['choice'],
  );
  choiceLesson.document = buildDocument(choiceLesson, words, choices);
  // Every kind once (the order is the lesson's rhythm, see rhythm.test.ts).
  assert.deepEqual(choices.map((e) => (e.type === 'choice' && choicePresetOf(e)) || '').sort(), [
    'find-picture',
    'first-sound',
    'is-it',
    'name-picture',
    'translate',
  ]);
  assert.deepEqual(
    reviewMaterial(
      { words, lessons: [choiceLesson], distribution: [5] },
      { ...input, mix: ['choice'], totalExercises: 5 },
      'en',
    ).filter((p) => p.lessonId),
    [],
  );

  // Review catches broken material: wrong total and an unsolvable word.
  const broken = structuredClone(output);
  broken.lessons[0]!.document!.exercises.pop();
  const problems = reviewMaterial(broken, input, 'en');
  assert.ok(problems.some((p) => /13 заданий/.test(p.message)));
});

test('the closing sentence lesson: closed vocabulary, one group per age, recordings', async () => {
  const words = ['fox', 'owl', 'bear', 'cat'].map((w) => ({
    key: w,
    text: w[0]!.toUpperCase() + w.slice(1),
    spelling: w,
    translation: `перевод ${w}`,
    imagePrompt: w,
    speechText: w,
  }));
  const plan = sentenceLessonPlan('en-zoo-03', words);
  assert.equal(plan.exerciseCount, SENTENCES_PER_BAND * 2);
  const payload = {
    language: 'en',
    languageTitle: 'English',
    topic: 'Зоопарк',
    words,
    perBand: SENTENCES_PER_BAND,
    feedback: null,
  };
  const result = await new FakeProvider().generateText({
    context: { jobId: 'job', stage: 'text', targetId: plan.lessonId },
    model: 'fake',
    schemaName: 'lesson_sentences',
    schema: toJsonSchema(sentencesDtoSchema),
    ...sentencesPrompt(payload),
    payload,
  });
  assert.ok(result.ok);
  const { exercises, sentences } = buildSentenceExercises(
    sentencesDtoSchema.parse(result.data),
    plan,
    words,
  );
  assert.equal(exercises.length, SENTENCES_PER_BAND * 2);
  assert.deepEqual(
    exercises.map((e) => e.ageBands?.join()),
    [...Array(SENTENCES_PER_BAND).fill('6-7'), ...Array(SENTENCES_PER_BAND).fill('8-9')],
  );
  const first = exercises[0]!;
  assert.ok(first.type === 'build-sentence');
  assert.deepEqual(first.answer, ['I', 'see', 'a', 'fox']);
  assert.equal(first.tokens.length, 5, 'one extra tile for 6–7');
  assert.equal(first.tokens.find((t) => t.text === 'fox')?.wordId, 'fox');
  assert.equal(first.audioId, `${sentences[0]!.key}-audio`);
  // «The bear is big» starts with a small letter: a capital would show the first tile.
  const older = exercises[SENTENCES_PER_BAND + 1]!;
  assert.ok(older.type === 'build-sentence' && older.answer[0] === 'the');
  // The lesson builds and passes review like any generated lesson.
  const lesson = {
    ...plan,
    sentences,
    document: buildDocument({ ...plan, sentences }, words, exercises),
  };
  const input = generationInputSchema.parse({ topic: 'Зоопарк', totalExercises: 6 });
  assert.deepEqual(
    reviewMaterial(
      { words, lessons: [lesson], distribution: [] },
      { ...input, totalExercises: 0 },
      'en',
    ),
    [],
  );
  // Words that are neither set words nor declared helper words are rejected.
  assert.throws(
    () =>
      buildSentenceExercises(
        {
          helperWords: ['i', 'like'],
          sentences: [
            { ageBand: '6-7', text: 'I like pizza', translation: '', hint: '', extraWords: [] },
          ],
        },
        plan,
        words,
      ),
    (e: unknown) => e instanceof MaterialError && e.problems.some((p) => /pizza/.test(p)),
  );
});

test('provider errors are classified for the queue', () => {
  assert.equal(classifyError({ status: 429, message: 'rate' }).kind, 'retryable');
  assert.equal(classifyError({ status: 503 }).kind, 'retryable');
  assert.equal(classifyError({ status: 400, message: 'bad' }).kind, 'permanent');
  assert.equal(classifyError({ status: 401 }).kind, 'permanent');
  assert.equal(classifyError({ code: 'ECONNRESET' }).kind, 'retryable');
  assert.equal(classifyError({ name: 'APIConnectionTimeoutError' }).kind, 'retryable');
  assert.equal(classifyError(new Error('schema mismatch')).kind, 'permanent');
  assert.equal(classifyError(new ProviderError('x', 'retryable')).kind, 'retryable');
});

test('fake provider simulates transient and permanent failures per stage', async () => {
  const provider = new FakeProvider();
  const simulate = { stage: 'image', times: 2, permanent: false, delayMs: 0 };
  const request = {
    context: { jobId: 'j', stage: 'image' as const, targetId: 'fox', simulate },
    model: 'fake',
    prompt: 'fox',
    size: '1024x1024' as const,
    quality: 'low',
  };
  await assert.rejects(provider.generateImage(request), /rate limit/);
  await assert.rejects(provider.generateImage(request), /rate limit/);
  assert.ok((await provider.generateImage(request)).png.length > 100);
  const permanent = {
    ...request,
    context: { ...request.context, simulate: { ...simulate, permanent: true } },
  };
  await assert.rejects(
    provider.generateImage(permanent),
    (e: ProviderError) => e.kind === 'permanent',
  );
});
