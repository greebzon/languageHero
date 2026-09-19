import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { courseLessonSchema, type CourseLesson } from '../../packages/contracts/src';
import { env } from '../../apps/api/src/env';
import { solve } from './helpers';
import { signIn, switchLanguage } from './account-helper';

const API = 'http://127.0.0.1:3002';
const ADMIN = { login: 'admin', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass' };

async function admin(request: APIRequestContext) {
  // Same-origin browser requests carry an Origin header; the CSRF guard expects it.
  const headers = { origin: API };
  const call = async (method: 'get' | 'post' | 'patch' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/v1/admin${path}`, { headers, data });
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${await response.text()}`).toBe(true);
    return response.json();
  };
  await call('post', '/auth/login', ADMIN);
  const upload = async (name: string, mimeType: string, buffer: Buffer) => {
    const response = await request.post(`${API}/v1/admin/assets`, {
      headers,
      multipart: { file: { name, mimeType, buffer } },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).asset as { id: string; sha256: string };
  };
  return { call, upload };
}

test('a set created in the panel appears in the running app and can be played', async ({
  page,
  request,
}) => {
  test.skip(!env.DATABASE_URL_TEST, 'DATABASE_URL_TEST is not set');
  test.setTimeout(120000);
  const { call, upload } = await admin(request);
  const mediaDir = join('content', 'store', 'media');
  const wavName = (await readdir(mediaDir)).find((n) => n.endsWith('.wav'))!;
  const cover = await upload(
    'tim.png',
    'image/png',
    await readFile('apps/mobile/assets/images/tim.png'),
  );
  const audio = await upload('fox.wav', 'audio/wav', await readFile(join(mediaDir, wavName)));

  await call('post', '/languages', { code: 'de', title: 'Немецкий', status: 'active' });
  await call('post', '/courses', {
    id: 'de-zoo',
    languageCode: 'de',
    title: 'Зоопарк',
    description: 'Первые немецкие слова',
    coverAssetId: cover.id,
    visibility: 'published',
  });
  // A draft set never reaches the public catalog.
  await call('post', '/courses', { id: 'de-secret', languageCode: 'de', title: 'Черновик' });
  const document = {
    words: [
      {
        id: 'fuchs',
        text: 'Der Fuchs',
        spelling: 'fuchs',
        translation: 'Лиса',
        imageId: 'tim',
        audioId: 'voice',
      },
      {
        id: 'eule',
        text: 'Die Eule',
        spelling: 'eule',
        translation: 'Сова',
        imageId: 'tim',
        audioId: 'voice',
      },
    ],
    media: [
      { id: 'tim', kind: 'image', assetId: cover.id },
      { id: 'voice', kind: 'audio', assetId: audio.id },
    ],
    exercises: [
      {
        id: 'ex-1',
        type: 'listen-and-select',
        prompt: 'Кто это?',
        hint: 'Рыжая',
        wordId: 'fuchs',
        choices: ['fuchs', 'eule'],
      },
      {
        id: 'ex-2',
        type: 'build-word',
        prompt: 'Собери слово',
        hint: 'Сова',
        wordId: 'eule',
        tiles: [
          { id: 't1', letter: 'l' },
          { id: 't2', letter: 'e' },
          { id: 't3', letter: 'u' },
          { id: 't4', letter: 'e' },
          { id: 't5', letter: 'x' },
        ],
      },
    ],
  };
  await call('post', '/courses/de-zoo/lessons', {
    id: 'de-zoo-01',
    title: 'Лиса и сова',
    document,
  });
  const validation = await call('post', '/courses/de-zoo/validate');
  expect(validation.ok).toBe(true);
  const plan = await call('post', '/publication-plans');
  expect(plan.diff.languages.added).toEqual(['de']);
  expect(plan.diff.courses.added).toEqual(['de-zoo']);
  const before = await (await request.get(`${API}/v1/catalog?schemaVersion=2`)).json();
  expect(before.languages.map((l: { code: string }) => l.code)).toEqual(['en']);

  const published = await call('post', '/publications', { planId: plan.publication.id });
  expect(published.publication.status).toBe('published');
  const catalog = await (await request.get(`${API}/v1/catalog?schemaVersion=2`)).json();
  expect(catalog.revision).toBe(before.revision + 1);
  expect(catalog.courses.map((c: { id: string }) => c.id)).toContain('de-zoo');
  expect(JSON.stringify(catalog)).not.toContain('de-secret');
  const lesson: CourseLesson = courseLessonSchema.parse(
    await (await request.get(`${API}/v1/lessons/de-zoo-01/versions/1`)).json(),
  );

  // The already-running app picks the new language up on refresh, without a rebuild.
  await signIn(page);
  await expect(page.getByText('Приключения обновлены')).toBeVisible();
  await switchLanguage(page, 'de');
  await expect(page.getByTestId('course-de-zoo')).toBeVisible();
  const coverImage = page.getByTestId('cover-zoo-cover').locator('img');
  await expect
    .poll(() =>
      coverImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/admin-published-set.png', fullPage: true });
  await page.getByTestId('start-lesson').click();
  await expect(page.getByText('Кто это?', { exact: true })).toBeVisible();
  for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
  await expect(page.getByText('ЛИСА И СОВА — ПРОЙДЕНО')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-lesson-done.png', fullPage: true });
});

test('an AI-generated draft set (fake provider) can be reviewed, published and played', async ({
  page,
  request,
}) => {
  test.skip(!env.DATABASE_URL_TEST, 'DATABASE_URL_TEST is not set');
  test.setTimeout(180000);
  const { call } = await admin(request);
  const settings = await call('get', '/generation-settings');
  expect(settings.providerName).toBe('fake');
  await call('post', '/languages', { code: 'fr', title: 'Французский', status: 'active' });
  await call('post', '/courses', {
    id: 'fr-farm',
    languageCode: 'fr',
    title: 'Ферма',
    visibility: 'published',
  });
  const started = await call('post', '/courses/fr-farm/generations', {
    topic: 'Ферма',
    totalExercises: 12,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(started.job.status).toBe('queued');
  await expect
    .poll(async () => (await call('get', `/generations/${started.job.id}`)).job.status, {
      timeout: 60_000,
      intervals: [500, 1000],
    })
    .toBe('awaiting-review');
  const view = await call('get', `/generations/${started.job.id}`);
  expect(view.job.result.lessons).toHaveLength(2);
  expect(view.progress.done).toBe(view.progress.total);
  const course = await call('get', '/courses/fr-farm');
  expect(course.lessons).toHaveLength(2);
  expect(course.course.cover).toBeTruthy();
  expect((await call('post', '/courses/fr-farm/validate')).ok).toBe(true);

  const plan = await call('post', '/publication-plans');
  expect(plan.diff.courses.added).toContain('fr-farm');
  await call('post', '/publications', { planId: plan.publication.id });
  const lesson: CourseLesson = courseLessonSchema.parse(
    await (await request.get(`${API}/v1/lessons/${course.lessons[0].id}/versions/1`)).json(),
  );
  expect(lesson.exercises).toHaveLength(6);

  await signIn(page);
  await expect(page.getByText('Приключения обновлены')).toBeVisible();
  await switchLanguage(page, 'fr');
  await expect(page.getByTestId('course-fr-farm')).toBeVisible();
  await page.getByTestId('start-lesson').click();
  await expect(page.getByText(lesson.exercises[0]!.prompt, { exact: true })).toBeVisible();
  for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
  await expect(page.getByText(`${lesson.title.toUpperCase()} — ПРОЙДЕНО`)).toBeVisible();
  await page.screenshot({ path: 'test-results/generated-lesson-done.png', fullPage: true });
});
