import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { releaseSchema, type CourseLesson } from '../../packages/contracts/src';
import { signIn } from './account-helper';
import { playable, solve } from './helpers';

const seed = releaseSchema.parse(
  JSON.parse(await readFile(new URL('../../content/seed.json', import.meta.url), 'utf8')),
);
/** The lesson the app is playing now (it is assembled on the device). */
const playing = (page: Page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lingvohero.learning.v3:'))!;
    return JSON.parse(localStorage.getItem(key)!).state.session.lesson;
  }) as Promise<CourseLesson>;

test('the set challenge opens after the set, crowns it with a chest, and can be lost', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page);
  for (const lesson of seed.lessons) {
    await page.getByTestId('start-lesson').click();
    for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
    await page.getByTestId('back-to-map').click();
  }
  // The finished set's card on the home screen offers its challenge.
  await page.getByTestId('boss-en-forest').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('boss-en-forest')).toBeVisible();
  await page.screenshot({ path: 'test-results/boss-home.png' });
  await page.getByTestId('open-en-forest').click();
  await expect(page.getByTestId('boss-card')).toContainText('Испытание сета');
  await page.screenshot({ path: 'test-results/boss-card.png', fullPage: true });
  await page.getByTestId('start-boss').click();
  await expect(page.getByTestId('hearts')).toHaveText('❤️❤️❤️');
  const boss = await playing(page);
  expect(boss.id).toBe('boss');
  const synced = page.waitForResponse(
    (r) =>
      r.url().endsWith('/v1/account/sync') &&
      (r.request().postDataJSON()?.attempts ?? []).some(
        (a: { lessonId: string }) => a.lessonId === 'boss',
      ),
  );
  for (const exercise of playable(boss)) await solve(page, exercise, boss);
  // The first win: a chest (its item reaches the wardrobe with the sync) and the crown.
  await expect(page.getByTestId('boss-chest')).toBeVisible();
  await page.screenshot({ path: 'test-results/boss-won.png', fullPage: true });
  const body = await (await synced).json();
  expect(body.rejected).toEqual([]);
  expect(body.journal.bosses['en-forest']).toBeTruthy();
  expect(body.journal.inventory.items).toHaveLength(1);

  // Again, with three wrong answers: the hearts run out.
  await page.getByTestId('repeat').click();
  await expect(page.getByTestId('hearts')).toHaveText('❤️❤️❤️');
  const again = await playing(page);
  const first = again.exercises[0]!;
  expect(first.type).toBe('listen-and-select');
  if (first.type !== 'listen-and-select') return;
  for (const wrong of first.choices.filter((c) => c !== first.wordId).slice(0, 3)) {
    await page.getByTestId(`choice-${wrong}`).click();
    await page.getByTestId('check-answer').click();
  }
  await expect(page.getByTestId('boss-lost')).toHaveText('Сердечки закончились');
  await page.screenshot({ path: 'test-results/boss-lost.png', fullPage: true });
  await page.getByTestId('back-to-map').click();
  await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
});
