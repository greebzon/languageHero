import { expect, test } from '@playwright/test';
import { solve } from './helpers';
import { signIn } from './account-helper';
import { readFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { releaseSchema } from '../../packages/contracts/src';
import { priceFor, shopItem } from '../../packages/learning-core/src/shop';
import { publishRelease } from '../../apps/api/src/content';
const seed = releaseSchema.parse(
  JSON.parse(await readFile(new URL('../../content/seed.json', import.meta.url), 'utf8')),
);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.addEventListener('timeupdate', () => {
        if (this.currentTime > 0) document.documentElement.dataset.audioPlayed = 'true';
      });
      return original.call(this);
    };
  });
  // Daily quests and the «после 18:00» trophy depend on the clock: pin it to a weekday noon.
  await page.clock.setFixedTime(new Date(2026, 8, 18, 12, 0, 0));
  await signIn(page);
});
test('all five lessons, error review, partial answer restoration, single rewards', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Приключения обновлены')).toBeVisible();
  await expect(page.getByTestId('preview-en-underwater')).toContainText('Скоро');
  for (const id of ['underwater-cover', 'space-cover']) {
    const cover = page.getByTestId(`cover-${id}`);
    await expect(cover).toBeVisible();
    await expect
      .poll(() =>
        cover
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    expect((await cover.boundingBox())!.height).toBeGreaterThan(150);
  }
  await page.screenshot({ path: 'test-results/worlds-home.png', fullPage: true });
  await page.getByTestId('open-en-forest').click();
  await page.getByTestId('level-2').click();
  await expect(page.getByText('Шаг за шагом', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Понятно', exact: true }).click();
  await page.screenshot({ path: 'test-results/course-map.png', fullPage: true });
  await page.getByRole('button', { name: 'Все миры', exact: true }).click();
  for (const [index, lesson] of seed.lessons.entries()) {
    await page.getByTestId('start-lesson').click();
    if (index === 4) {
      await expect(page.getByText('Проверь список гостей', { exact: true })).toBeVisible();
      await expect(page.getByText(lesson.presentation!.intro)).toBeVisible();
      await expect(page.getByTestId('play-audio')).toHaveCount(0);
      await page.screenshot({ path: 'test-results/forest-party.png', fullPage: true });
    }
    if (index === 0) {
      await page.getByTestId('play-audio').click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.audioPlayed))
        .toBe('true');
      await page.getByTestId('choice-bear').click();
      await page.getByTestId('check-answer').click();
      await expect(page.getByText('Почти! Попробуй ещё')).toBeVisible();
    }
    if (index === 2) {
      await page.getByTestId('pair-word-fox').click();
      await page.getByTestId('pair-image-bear').click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem(
              Object.keys(localStorage).find((k) => k.startsWith('lingvohero.learning.v3:'))!,
            ),
          ),
        )
        .toContain('"fox":"bear"');
      await page.reload();
      await expect(page.getByRole('button', { name: 'Сбросить пары' })).toBeVisible();
      await page.screenshot({ path: 'test-results/matching.png', fullPage: true });
      await page.getByRole('button', { name: 'Сбросить пары' }).click();
    }
    if (index === 3) {
      // «Собери слово»: Tim's hint shows how the word is written.
      const spell = lesson.exercises[0];
      await page.getByRole('button', { name: 'Подсказка друга' }).click();
      await expect(page.getByTestId('hint-spelling')).toHaveText(
        lesson.words.find((w) => w.id === (spell as { wordId: string }).wordId)!.spelling,
      );
      await expect(page.getByTestId('hint-spelling')).toBeInViewport();
      await page.screenshot({ path: 'test-results/spelling-hint.png' });
      await page.getByRole('button', { name: 'Подсказка друга' }).click();
      await page.getByTestId('letter-tile-0').click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem(
              Object.keys(localStorage).find((k) => k.startsWith('lingvohero.learning.v3:'))!,
            ),
          ),
        )
        .toContain('"tileIds":["tile-0"]');
      await page.reload();
      await expect(page.getByTestId('chosen-tile-0')).toBeVisible();
      await page.screenshot({ path: 'test-results/spelling.png', fullPage: true });
      await page.getByTestId('chosen-tile-0').click();
    }
    for (const ex of lesson.exercises) await solve(page, ex, lesson);
    if (index === 0) {
      await expect(page.getByTestId('review-notice')).toBeVisible();
      await solve(page, lesson.exercises[0], lesson);
    }
    await expect(
      page.getByText(lesson.presentation?.completionTitle ?? 'Ты — друг леса!'),
    ).toBeVisible();
    await page.getByTestId('back-to-map').click();
  }
  await page.getByRole('tab', { name: 'Награды' }).click();
  await expect(page.getByTestId('coins-value')).toHaveText('150');
  await expect(page.getByText('1 из 1 готово! 🎉')).toBeVisible();
  await expect(page.getByText('Осталось 12 ч')).toBeVisible();
  await page.screenshot({ path: 'test-results/treasury.png', fullPage: true });
  await page.getByText('Гардероб героя').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/treasury-trophies.png', fullPage: true });
  await page.getByRole('button', { name: 'Забрать 20 монет', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Награда взята', exact: true })).toBeDisabled();
  await expect(page.getByTestId('coins-value')).toHaveText('170');
  await page.getByRole('button', { name: 'Магазин', exact: true }).click();
  await expect(page.getByTestId('shop-coins')).toHaveText('170');
  await page.screenshot({ path: 'test-results/shop.png', fullPage: true });
  const capPrice = priceFor(shopItem('cap')!, new Date(2026, 8, 18, 12));
  await page.getByTestId('buy-astronaut').click();
  await expect(page.getByText('Не хватает монет')).toBeVisible();
  await page.getByTestId('buy-cap').click();
  await expect(page.getByText('Куплено: Кепка скаута!')).toBeVisible();
  await expect(page.getByTestId('shop-coins')).toHaveText(String(170 - capPrice));
  // Owned items can be put on straight from the shop; the look lives in the account.
  await expect(page.getByTestId('buy-cap')).toBeEnabled();
  await page.getByTestId('buy-cap').click();
  await expect(page.getByRole('button', { name: 'Надето', exact: true })).toBeDisabled();
  await page.goto('/wardrobe');
  await expect(page.getByRole('heading', { name: 'Примерочная' })).toBeVisible();
  await expect(page.getByText('1 надето')).toBeVisible();
  await page.screenshot({ path: 'test-results/wardrobe.png', fullPage: true });
  await page.getByTestId('wear-cap').click();
  await expect(page.getByText('0 надето')).toBeVisible();
  await page.getByTestId('save-outfit').click();
  await expect(page.getByText('Образ сохранён!')).toBeVisible();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Награды' }).click();
  await page.getByRole('button', { name: 'Магазин', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Надеть Кепка скаута', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Награды' }).click();
  await expect(page.getByTestId('coins-value')).toHaveText(String(170 - capPrice));
  await page.getByRole('tab', { name: 'Миры' }).click();
  await expect(page.getByTestId('course-en-forest')).toContainText('Сет пройден');
  await page.getByTestId('open-en-forest').click();
  await page.getByTestId('start-lesson').click();
  for (const ex of seed.lessons[0].exercises) await solve(page, ex, seed.lessons[0]);
  await page.getByTestId('back-to-map').click();
  await page.getByRole('tab', { name: 'Награды' }).click();
  await expect(page.getByTestId('coins-value')).toHaveText(String(170 - capPrice));
  await expect(page.getByRole('button', { name: 'Награда взята', exact: true })).toBeDisabled();
  // «Моя статистика» in the profile: the whole first set, today's streak, this week's bars.
  await page.getByRole('tab', { name: 'Профиль' }).click();
  await expect(page.getByText('Моя статистика')).toBeVisible();
  await expect(page.getByTestId('stat-lessons')).toHaveText(
    new RegExp(`^${seed.lessons.length} из [0-9]+$`),
  );
  await expect(page.getByTestId('stat-streak')).toHaveText('1');
  await expect(page.getByText('1 день с уроками')).toBeVisible();
  await page.getByText('Эта неделя').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/profile-stats.png' });
  expect(errors).toEqual([]);
});
test('offline audio on a later question, narrow screen, sound persistence and migration', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('lingvohero.learning.v2'))
      localStorage.setItem(
        'lingvohero.demo.v1',
        JSON.stringify({
          version: 1,
          soundEnabled: true,
          completed: true,
          bestStars: 2,
          session: null,
        }),
      );
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Профиль' }).click();
  await page.getByRole('button', { name: 'Перенести мои старые результаты' }).click();
  await expect(page.getByText('Старые результаты перенесены.')).toBeVisible();
  await page.getByRole('tab', { name: 'Миры' }).click();
  await expect(page.getByTestId('course-en-forest')).toContainText('Пройдено 1 из 5 уроков');
  await page.screenshot({ path: 'test-results/worlds-narrow.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('start-lesson').click();
  await context.setOffline(true);
  await expect(
    page
      .getByText('Нет связи. Скачанный урок доступен — продолжай играть!')
      .filter({ visible: true }),
  ).toBeVisible();
  await solve(page, seed.lessons[1].exercises[0], seed.lessons[1]);
  await page.getByTestId('play-audio').click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.audioPlayed))
    .toBe('true');
  await solve(page, seed.lessons[1].exercises[1], seed.lessons[1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Выйти из урока' }).click();
  await page.getByRole('button', { name: 'Вернуться на карту', exact: true }).click();
  await page.getByRole('tab', { name: 'Награды' }).click();
  await expect(page.getByTestId('coins-value')).toHaveText('30');
  await page.getByRole('tab', { name: 'Профиль' }).click();
  await page.getByRole('switch', { name: 'Звук', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Звук', exact: true })).not.toBeChecked();
});
test('real API publication appears on refresh; an open lesson keeps its version until restarted', async ({
  page,
}) => {
  test.setTimeout(120000);
  const root = resolve('.cache/e2e-content');
  await page.goto('/');
  await expect(page.getByText('Приключения обновлены')).toBeVisible();
  await page.getByTestId('start-lesson').click();
  await solve(page, seed.lessons[0].exercises[0], seed.lessons[0]);
  const next = structuredClone(seed);
  const catalog = await (await fetch('http://127.0.0.1:3002/v1/catalog?schemaVersion=2')).json();
  next.catalog.revision = catalog.revision + 1;
  const bumped = seed.lessons[0].version + 1;
  next.lessons[0].version = bumped;
  next.lessons[0].title = 'Лесные друзья: обновление';
  Object.assign(next.catalog.courses[0].lessons[0], {
    version: bumped,
    title: next.lessons[0].title,
  });
  const extra = {
    ...structuredClone(seed.lessons[0]),
    id: 'new-remote-lesson',
    title: 'Секретная тропинка',
    version: 1,
    exercises: [seed.lessons[0].exercises[0]],
    texts: undefined,
  };
  // A remote image absent from the app's media manifest proves media is data too.
  const image = resolve('apps/mobile/assets/images/tim.png');
  const filename =
    createHash('sha256')
      .update(await readFile(image))
      .digest('hex') + '.png';
  await copyFile(image, join(root, 'media', filename));
  extra.media[0] = { id: 'fox-image', kind: 'image', path: `/v1/media/${filename}` };
  next.lessons.push(extra);
  next.catalog.courses.push({
    id: 'en-bonus',
    language: 'en',
    title: 'Новое приключение',
    lessons: [
      {
        id: extra.id,
        version: 1,
        title: extra.title,
        exerciseCount: 1,
        requiredTypes: ['listen-and-select'],
      },
    ],
  });
  await publishRelease(next, root);
  await page.reload();
  await expect(page.getByTestId('question-counter')).toHaveText('2 / 6');
  await expect(page.getByText('Лесные друзья', { exact: true })).toBeVisible();
  // Started again from the map, the republished lesson begins on its new version.
  await page.goto('/');
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('question-counter')).toHaveText('1 / 6');
  await expect(page.getByText('Лесные друзья: обновление', { exact: true })).toBeVisible();
  for (const ex of seed.lessons[0].exercises) await solve(page, ex, seed.lessons[0]);
  await page.getByTestId('back-to-map').click();
  await page.getByRole('button', { name: 'Обновить уроки' }).click();
  await expect(page.getByTestId('course-en-bonus')).toContainText('Новое приключение');
  await page.getByTestId('locked-en-bonus').click();
  await expect(page.getByText('Сначала заверши сет «Загадочный лес».')).toBeVisible();
  await page.getByRole('button', { name: 'Понятно', exact: true }).click();
  await page.goto('/course?id=en-bonus');
  await expect(page.getByText('Этот сет пока недоступен.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('start-lesson')).toHaveCount(0);
  await page.getByRole('button', { name: 'Все миры', exact: true }).click();
  for (const lesson of seed.lessons.slice(1)) {
    await page.getByTestId('start-lesson').click();
    for (const ex of lesson.exercises) await solve(page, ex, lesson);
    await page.getByTestId('back-to-map').click();
  }
  await expect(page.getByTestId('course-en-bonus')).toContainText('ТЕКУЩИЙ СЕТ');
  await page.getByTestId('open-en-bonus').click();
  const mediaRequest = page.waitForResponse(
    (r) => r.url().endsWith(filename) && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Начать урок Секретная тропинка', exact: true }).click();
  await mediaRequest;
  await solve(page, extra.exercises[0], extra);
  await expect(page.getByText('180', { exact: true })).toBeVisible();
});
