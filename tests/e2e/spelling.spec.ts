import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { releaseSchema, type CourseExercise } from '../../packages/contracts/src';
import { spellingTiles } from '../../packages/learning-core/src/spelling';
import { playable, solve, solveCurrent } from './helpers';
import { signIn } from './account-helper';

const seed = releaseSchema.parse(
  JSON.parse(await readFile(new URL('../../content/seed.json', import.meta.url), 'utf8')),
);
type BuildWord = Extract<CourseExercise, { type: 'build-word' }>;

test('a five-year-old builds words from the model; age 8 in the profile brings the plain exercise', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page, undefined, 5);
  // A five-year-old gets eased exercises (fewer pairs, fewer options): solve what is shown.
  for (const lesson of seed.lessons.slice(0, 3)) {
    await page.getByTestId('start-lesson').click();
    for (let i = 0; i < playable(lesson, '6-7').length; i += 1) await solveCurrent(page);
    await page.getByTestId('back-to-map').click();
  }
  // «Собери слово» from the model: the word stands in its slots letter by letter.
  const lesson = seed.lessons[3];
  const exercise = lesson.exercises[0] as BuildWord;
  const spelling = lesson.words.find((w) => w.id === exercise.wordId)!.spelling;
  await page.getByTestId('start-lesson').click();
  await expect(
    page.getByText('Собери слово по образцу: найди такие же буквы по порядку.', { exact: true }),
  ).toBeVisible();
  for (const [i, letter] of Array.from(spelling).entries())
    await expect(page.getByTestId(`slot-${i}`)).toHaveText(letter);
  // A letter that does not match the next slot stays out of the word and counts no mistake.
  const other = exercise.tiles.find((t) => t.letter !== spelling[0])!;
  await page.getByTestId(`letter-${other.id}`).click();
  await expect(
    page.getByText('Это другая буква. Найди такую же, как в слове.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('check-answer')).toBeDisabled();
  await page.screenshot({ path: 'test-results/spelling-model.png', fullPage: true });
  for (let i = 0; i < lesson.exercises.length; i += 1) await solveCurrent(page);
  await page.getByTestId('back-to-map').click();

  // The last lesson's words come with distractor letters: the model offers only the word's own.
  const last = seed.lessons[4];
  const mixed = last.exercises[1] as BuildWord;
  const own = spellingTiles(mixed, last.words.find((w) => w.id === mixed.wordId)!.spelling);
  expect(own.length).toBeLessThan(mixed.tiles.length);
  await page.getByTestId('start-lesson').click();
  await solve(page, last.exercises[0], last);
  for (const tile of mixed.tiles)
    await expect(page.getByTestId(`letter-${tile.id}`)).toHaveCount(own.includes(tile) ? 1 : 0);

  // Eight years old in the profile: the same exercise comes back plain, distractors included.
  await page.getByRole('button', { name: 'Выйти из урока', exact: true }).click();
  await page.getByRole('button', { name: 'Вернуться на карту', exact: true }).click();
  await page.getByRole('tab', { name: 'Профиль' }).click();
  await expect(page.getByTestId('age-5')).toBeChecked();
  await page.getByTestId('age-8').click();
  await expect(page.getByTestId('age-8')).toBeChecked();
  await expect(page.getByTestId('age-5')).not.toBeChecked();
  await page.getByTestId('age-8').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/profile-age.png' });
  await page.getByRole('tab', { name: 'Миры' }).click();
  await page.getByTestId('start-lesson').click();
  await expect(
    page.getByText('Собери слово. Нажми на буквы по порядку.', { exact: true }),
  ).toBeVisible();
  for (const tile of mixed.tiles) await expect(page.getByTestId(`letter-${tile.id}`)).toBeVisible();
  await expect(page.getByTestId('slot-0')).toHaveCount(0);
});
