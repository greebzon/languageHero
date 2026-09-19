import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function signIn(page: Page, email = `learner-${randomUUID()}@example.test`) {
  await page.addLocatorHandler(page.getByTestId('level-continue'), async (button) => {
    await button.click();
  });
  await page.goto('/');
  await expect(page.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/login.png', fullPage: true });
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  const sent = page.waitForResponse(
    (r) => r.url().endsWith('/v1/account/auth/code') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  const response = await sent;
  expect(response.status()).toBe(200);
  const { challengeId } = await response.json();
  const mail = JSON.parse(
    await readFile(resolve('.cache/e2e-mail', `${challengeId}.json`), 'utf8'),
  );
  await page.getByLabel('Код из письма', { exact: true }).fill(mail.code);
  await page.screenshot({ path: 'test-results/login-code.png', fullPage: true });
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  await expect(
    page.getByText('Сохрани резервный код', { exact: true }).or(page.getByTestId('start-lesson')),
  ).toBeVisible();
  if (await page.getByRole('button', { name: 'Код сохранён' }).isVisible()) {
    await page.getByRole('button', { name: 'Код сохранён' }).click();
    await page.getByLabel('Игровое имя').fill('Лёва');
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Совёнок Умка', exact: true })).toBeDisabled();
    await page.getByRole('radio', { name: 'Лисёнок Тим', exact: true }).click();
    await page.screenshot({ path: 'test-results/onboarding-mascot.png', fullPage: true });
    await page.getByRole('button', { name: 'Выбрать этого героя', exact: true }).click();
    // The learning language is picked after the sign-up, on its own screen.
    await expect(page.getByText('Какой язык будем учить?', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/onboarding-language.png', fullPage: true });
    await page.getByTestId('language-en').click();
  }
  await expect(page.getByTestId('start-lesson')).toBeVisible();
  return email;
}

/** The ☰ of the screen in front (tabs keep the others mounted, hidden). */
export const menuButton = (page: Page) =>
  page.getByTestId('open-menu').filter({ visible: true }).first();

/** Side menu → «Языки» → the language (added when new); back on the world map. */
export async function switchLanguage(page: Page, code: string) {
  await menuButton(page).click();
  await page.getByTestId('menu-languages').click();
  await expect(page.getByText('Мои языки', { exact: true })).toBeVisible();
  await page.getByTestId(`language-${code}`).click();
  await expect(menuButton(page)).toBeVisible();
}

/** A child learning several languages picks one at every start (a reload is a start). */
export async function pickLanguageIfAsked(page: Page, code: string) {
  const asked = page.getByText('Какой язык сегодня?', { exact: true });
  await expect(asked.or(menuButton(page))).toBeVisible();
  if (await asked.isVisible()) await page.getByTestId(`language-${code}`).click();
}
