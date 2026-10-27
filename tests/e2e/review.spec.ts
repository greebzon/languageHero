import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { releaseSchema, type CourseLesson } from '../../packages/contracts/src';
import { signIn } from './account-helper';
import { playable, solve } from './helpers';

const seed = releaseSchema.parse(
  JSON.parse(await readFile(new URL('../../content/seed.json', import.meta.url), 'utf8')),
);

test('a review is assembled from finished lessons and the server accepts it', async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId('start-review')).toHaveCount(0);
  const lesson = seed.lessons[0]!;
  await page.getByTestId('start-lesson').click();
  for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
  await page.getByTestId('back-to-map').click();

  // One finished lesson is enough: its words make the review.
  await page.getByTestId('start-review').click();
  await expect(page.getByText('Повторим слова, которые уже знакомы!')).toBeVisible();
  const review = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lingvohero.learning.v3:'))!;
    return JSON.parse(localStorage.getItem(key)!).state.session.lesson;
  });
  expect(review.id).toBe('review');
  await page.screenshot({ path: 'test-results/review.png', fullPage: true });
  const synced = page.waitForResponse(
    (r) =>
      r.url().endsWith('/v1/account/sync') &&
      r.request().method() === 'POST' &&
      (r.request().postDataJSON()?.attempts ?? []).some(
        (a: { lessonId: string }) => a.lessonId === 'review',
      ),
  );
  for (const exercise of playable(review as CourseLesson))
    await solve(page, exercise, review as CourseLesson);
  await expect(page.getByTestId('back-to-map')).toBeVisible();
  const body = await (await synced).json();
  expect(body.rejected).toEqual([]);
  // Stars from the lesson and the review; a review adds no lesson of the map.
  expect(body.journal.stars).toBe(6);
  expect(Object.keys(body.learning.progress)).toEqual([lesson.id]);
});
