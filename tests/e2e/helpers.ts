import { expect, type Page } from '@playwright/test';
import type { AgeBand, CourseExercise, CourseLesson } from '../../packages/contracts/src';
import { playableIndices } from '../../packages/learning-core/src/course';

/** The exercises a child of this age group plays, in order (some are for one group only). */
export const playable = (lesson: CourseLesson, ageBand: AgeBand = '8-9') =>
  playableIndices(lesson, { ageBand }).map((i) => lesson.exercises[i]!);

/** Answers one exercise the way a child would and advances to the next one. */
export async function solve(page: Page, exercise: CourseExercise, lesson: CourseLesson) {
  if (exercise.type === 'listen-and-select')
    await page.getByTestId(`choice-${exercise.wordId}`).click();
  else if (exercise.type === 'match-pairs') {
    for (const id of exercise.wordIds) {
      await page.getByTestId(`pair-word-${id}`).click();
      await page.getByTestId(`pair-image-${id}`).click();
    }
  } else if (exercise.type === 'choice')
    await page.getByTestId(`option-${exercise.answerId}`).click();
  else if (exercise.type === 'build-sentence') {
    const left = [...exercise.tokens];
    for (const word of exercise.answer) {
      const tile = left.splice(
        left.findIndex((t) => t.text.toLowerCase() === word.toLowerCase()),
        1,
      )[0]!;
      await page.getByTestId(`token-${tile.id}`).click();
    }
  } else {
    const available = [...exercise.tiles];
    for (const letter of lesson.words.find((w) => w.id === exercise.wordId)!.spelling) {
      const tile = available.splice(
        available.findIndex((t) => t.letter === letter),
        1,
      )[0];
      await page.getByTestId(`letter-${tile.id}`).click();
    }
  }
  await page.getByTestId('check-answer').click();
  await expect(page.getByText('Здорово! Получилось!')).toBeVisible();
  await page.getByTestId('next-question').click();
}
