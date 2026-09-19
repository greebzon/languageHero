import test from 'node:test';
import assert from 'node:assert/strict';
import { generationInputSchema, type GenerationOutput } from '@lingvohero/contracts';
import { inspectMedia } from '../admin/media.js';
import { distribute, wordCountFor } from './distribute.js';
import {
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
import { lessonPrompt, planPrompt } from './prompts.js';
import { classifyError, ProviderError } from './provider.js';
import { reviewMaterial } from './review.js';

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
  for (const schema of [planDtoSchema, lessonDtoSchema]) {
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
      mix: input.mix,
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
      input.mix,
    );
    lesson.document = buildDocument(lesson, words, exercises);
  }
  const output: GenerationOutput = { words, lessons, distribution };
  assert.deepEqual(reviewMaterial(output, input, 'en'), []);
  const total = lessons.reduce((s, l) => s + l.document!.exercises.length, 0);
  assert.equal(total, 14);
  const tiles = lessons[0]!.document!.exercises.find((e) => e.type === 'build-word');
  assert.ok(tiles && tiles.type === 'build-word' && tiles.tiles.length >= 4);

  // Review catches broken material: wrong total and an unsolvable word.
  const broken = structuredClone(output);
  broken.lessons[0]!.document!.exercises.pop();
  const problems = reviewMaterial(broken, input, 'en');
  assert.ok(problems.some((p) => /13 заданий/.test(p.message)));
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
