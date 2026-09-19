import { expect, type Page } from '@playwright/test';
import type { CourseExercise, CourseLesson } from '../../packages/contracts/src';

/** Answers one exercise the way a child would and advances to the next one. */
export async function solve(page: Page, exercise: CourseExercise, lesson: CourseLesson) {
  if (exercise.type === 'listen-and-select')
    await page.getByTestId(`choice-${exercise.wordId}`).click();
  else if (exercise.type === 'match-pairs') {
    for (const id of exercise.wordIds) {
      await page.getByTestId(`pair-word-${id}`).click();
      await page.getByTestId(`pair-image-${id}`).click();
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
