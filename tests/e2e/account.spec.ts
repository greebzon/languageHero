import { test, expect } from '@playwright/test';
import { signIn } from './account-helper';

test('mandatory registration, profile editing and browser cookie isolation', async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/lesson');
  await expect(page.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  await expect(page.getByTestId('check-answer')).toHaveCount(0);
  const email = await signIn(page);
  await page.getByRole('tab', { name: 'Профиль' }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByLabel('Имя в профиле').fill('Маша');
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(page.getByText('Профиль сохранён.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Имя в профиле')).toHaveValue('Маша');
  const cookies = await context.cookies('http://localhost:3002/v1/account/me');
  expect(cookies.find((c) => c.name === 'lh_learner')?.httpOnly).toBe(true);
  const keys = await page.evaluate(() =>
    Object.keys(localStorage)
      .map((k) => localStorage.getItem(k))
      .join(''),
  );
  expect(keys).not.toContain(cookies.find((c) => c.name === 'lh_learner')!.value);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/account-profile.png', fullPage: true });
  const separate = await browser.newContext();
  const other = await separate.newPage();
  await other.goto('http://localhost:8082/');
  await expect(other.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  await separate.close();
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
  await page.getByRole('button', { name: 'Подтверждаю выход', exact: true }).click();
  await expect(page.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
