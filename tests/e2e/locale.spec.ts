import { expect, test } from '@playwright/test';
import { menuButton, signIn } from './account-helper';

test.describe('an English device', () => {
  test.use({ locale: 'en-US' });
  test('the app speaks the device language before sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sign in with a code', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get a code', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await page.screenshot({ path: 'test-results/locale-en-login.png', fullPage: true });
  });
});

test('side menu, languages screen and the interface language (Hebrew turns the layout)', async ({
  page,
}) => {
  test.setTimeout(90000);
  await signIn(page);
  // ☰ opens the menu with its sections; «Языки» shows the language being learned.
  await menuButton(page).click();
  for (const id of ['worlds', 'languages', 'wardrobe', 'profile'])
    await expect(page.getByTestId(`menu-${id}`)).toBeVisible();
  await expect(page.getByText('Учу: Английский', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/side-menu.png' });
  await page.getByTestId('menu-languages').click();
  await expect(page.getByText('Мои языки', { exact: true })).toBeVisible();
  await expect(page.getByTestId('language-en')).toContainText('Сейчас');
  await page.screenshot({ path: 'test-results/languages.png', fullPage: true });

  // The interface language is chosen in the profile and follows the child.
  await menuButton(page).click();
  await page.getByTestId('menu-profile').click();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/v1/account/me') && r.request().method() === 'PATCH',
  );
  await page.getByTestId('locale-en').click();
  expect((await (await saved).json()).profile.locale).toBe('en');
  await expect(page.getByText('App language', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Worlds/ })).toBeVisible();

  await page.getByTestId('locale-he').click();
  await expect(page.getByText('שפת האפליקציה', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await page.getByRole('tab', { name: /עולמות/ }).click();
  // Sets and lessons come in Hebrew; the menu slides in from the right.
  await expect(page.getByTestId('course-en-forest')).toContainText('יער מסתורי');
  await page.screenshot({ path: 'test-results/locale-he-home.png', fullPage: true });
  await menuButton(page).click();
  const menu = await page.getByTestId('menu-languages').boundingBox();
  expect(menu!.x).toBeGreaterThan(page.viewportSize()!.width / 3);
  await page.screenshot({ path: 'test-results/locale-he-menu.png' });
  await page.getByTestId('menu-profile').click();
  await page.getByTestId('locale-ru').click();
  await expect(page.getByText('Язык приложения', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
});
