import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { releaseSchema } from '../../packages/contracts/src';
import { signIn } from './account-helper';
import { solve } from './helpers';

const seed = releaseSchema.parse(
  JSON.parse(await readFile(new URL('../../content/seed.json', import.meta.url), 'utf8')),
);

test('a 6-year-old gets eased exercises that the server accepts', async ({ page }) => {
  await signIn(page, undefined, 6);
  const lesson = seed.lessons[0]!;
  const first = lesson.exercises[0]!;
  expect(first.type === 'listen-and-select' && first.choices.length).toBe(4);
  await page.getByTestId('start-lesson').click();
  // Four pictures in the package, three for a 6-year-old (the right one always stays).
  await expect(page.locator('[data-testid^="choice-"]')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/age-6-lesson.png', fullPage: true });
  const synced = page.waitForResponse(
    (r) => r.url().endsWith('/v1/account/sync') && r.request().method() === 'POST',
  );
  for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
  await expect(page.getByTestId('back-to-map')).toBeVisible();
  // The server replays the attempt with the same easing and accepts it.
  const body = await (await synced).json();
  expect(body.rejected).toEqual([]);
  expect(body.accepted).toHaveLength(1);
});
