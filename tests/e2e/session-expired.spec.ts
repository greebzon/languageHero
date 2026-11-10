import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { releaseSchema } from '../../packages/contracts/src';
import { signIn } from './account-helper';
import { solve } from './helpers';

const seed = releaseSchema.parse(
  JSON.parse(await readFile(new URL('../../content/seed.json', import.meta.url), 'utf8')),
);

test('a sign-in that ended: the game goes on, a notice leads to login, results reach the server', async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const email = await signIn(page);
  await context.clearCookies();
  await page.reload();
  const notice = page.getByTestId('confirm-email');
  await expect(notice).toBeVisible();
  await page.screenshot({ path: 'test-results/session-expired.png', fullPage: true });

  const lesson = seed.lessons[0]!;
  await page.getByTestId('start-lesson').click();
  for (const exercise of lesson.exercises) await solve(page, exercise, lesson);
  await page.getByTestId('back-to-map').click();
  await expect(notice).toBeVisible();

  // A new code for the same address is allowed a minute after the previous one.
  await page.waitForTimeout(61000);
  await notice.click();
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  const sent = page.waitForResponse(
    (r) => r.url().endsWith('/v1/account/auth/code') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  const { challengeId } = await (await sent).json();
  const mail = JSON.parse(
    await readFile(resolve('.cache/e2e-mail', `${challengeId}.json`), 'utf8'),
  );
  await page.getByLabel('Код из письма', { exact: true }).fill(mail.code);
  const synced = page.waitForResponse(
    (r) =>
      r.url().endsWith('/v1/account/sync') &&
      r.request().method() === 'POST' &&
      (r.request().postDataJSON()?.attempts ?? []).length > 0,
  );
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click();
  const body = await (await synced).json();
  expect(body.rejected).toEqual([]);
  expect(body.accepted).toHaveLength(1);
  expect(Object.keys(body.learning.progress)).toEqual([lesson.id]);
  await expect(notice).toHaveCount(0);
});
