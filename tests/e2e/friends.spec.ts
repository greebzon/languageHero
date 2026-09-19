import { test, expect } from '@playwright/test';
import { signIn } from './account-helper';
import { solve } from './helpers';
import seed from '../../content/seed.json' with { type: 'json' };
import { releaseSchema } from '../../packages/contracts/src';

test('friends: locked previews, earned unlock, selection, reload and offline failure', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole('button', { name: 'Мои друзья', exact: true }).first().click();
  await expect(page.getByTestId('friend-fox')).toContainText('С тобой');
  await page.getByTestId('friend-owl').click();
  await expect(page.getByTestId('choose-friend')).toBeDisabled();
  await expect(page.getByTestId('choose-friend')).toContainText('Откроется на уровне 8');
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/friends-locked.png', fullPage: true });
  await page.getByTestId('close-friend-preview').click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  for (const lesson of releaseSchema.parse(seed).lessons.slice(0, 3)) {
    await page.getByTestId('start-lesson').click();
    for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
    await page.getByTestId('back-to-map').click();
  }
  await expect(page.getByText('Уровень 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Мои друзья', exact: true }).first().click();
  await page.getByTestId('friend-rabbit').click();
  await expect(page.getByTestId('choose-friend')).toBeEnabled();
  await page.getByTestId('choose-friend').click();
  await expect(page.getByTestId('friend-rabbit')).toContainText('С тобой');
  await page.reload();
  await expect(page.getByTestId('friend-rabbit')).toContainText('С тобой');
  await page.screenshot({ path: 'test-results/friends-unlocked.png', fullPage: true });
  const second = await browser.newContext({ storageState: await context.storageState() });
  try {
    const other = await second.newPage();
    await other.goto('http://localhost:8082/friends');
    await expect(other.getByTestId('friend-rabbit')).toContainText('С тобой');
  } finally {
    await second.close();
  }
  await page.getByTestId('friend-fox').click();
  await page.route('**/v1/account/me', (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await page.getByTestId('choose-friend').click();
  await expect(
    page.getByText('Не удалось выбрать друга. Проверь связь и попробуй снова.'),
  ).toBeVisible();
  await expect(page.getByTestId('friend-rabbit')).toContainText('С тобой');
  await page.unroute('**/v1/account/me');
  for (const [locale, title] of [
    ['en', 'My friends'],
    ['he', 'החברים שלי'],
  ]) {
    await page.evaluate((value) => localStorage.setItem('lingvohero.locale', value), locale!);
    await page.reload();
    await expect(page.getByTestId('friends-title')).toHaveText(title!);
    await expect(page.getByTestId('friend-rabbit')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/friends-${locale}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
