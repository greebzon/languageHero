import { expect, type Page } from '@playwright/test';
import type { AgeBand, CourseExercise, CourseLesson } from '../../packages/contracts/src';
import { currentExercise, playableIndices } from '../../packages/learning-core/src/course';

/** The exercises a child of this age group plays, in order (some are for one group only). */
export const playable = (lesson: CourseLesson, ageBand: AgeBand = '8-9') =>
  playableIndices(lesson, { ageBand }).map((i) => lesson.exercises[i]!);

/** Answers one exercise the way a child would and advances to the next one. */
export async function solve(page: Page, exercise: CourseExercise, lesson: CourseLesson) {
  const tap = (testId: string) => page.getByTestId(testId).click();
  switch (exercise.type) {
    case 'listen-and-select':
      await tap(`choice-${exercise.wordId}`);
      break;
    case 'match-pairs':
      for (const id of exercise.wordIds) {
        await tap(`pair-word-${id}`);
        await tap(`pair-image-${id}`);
      }
      break;
    case 'choice':
      await tap(`option-${exercise.answerId}`);
      break;
    case 'build-word': {
      const left = [...exercise.tiles];
      for (const letter of lesson.words.find((w) => w.id === exercise.wordId)!.spelling) {
        const tile = left.splice(
          left.findIndex((t) => t.letter === letter),
          1,
        )[0]!;
        await tap(`letter-${tile.id}`);
      }
      break;
    }
    case 'build-sentence': {
      const left = [...exercise.tokens];
      for (const word of exercise.answer) {
        const tile = left.splice(
          left.findIndex((t) => t.text.toLowerCase() === word.toLowerCase()),
          1,
        )[0]!;
        await tap(`token-${tile.id}`);
      }
      break;
    }
    case 'memory':
      for (const id of exercise.wordIds) {
        await tap(`card-${id}-image`);
        await tap(`card-${id}-text`);
      }
      break;
    case 'fill-gap':
      await tap(`gap-option-${exercise.answerId}`);
      break;
    case 'catch-word':
      // The bubbles keep floating, so they are never «stable» for Playwright.
      for (const round of exercise.rounds)
        await page.getByTestId(`bubble-${round.wordId}`).click({ force: true });
      break;
    default: {
      const unknown: never = exercise;
      throw new Error(`No e2e answer for ${JSON.stringify(unknown)}`);
    }
  }
  await page.getByTestId('check-answer').click();
  await expect(page.getByText('Здорово! Получилось!')).toBeVisible();
  await page.getByTestId('next-question').click();
}

/**
 * Solves the exercise the app shows now, as eased for the child's age group: read from the
 * saved session once it has caught up with the question on screen.
 */
export async function solveCurrent(page: Page) {
  const [n] = (await page.getByTestId('question-counter').innerText()).split('/').map(Number);
  let session: Parameters<typeof currentExercise>[0] | undefined;
  await expect
    .poll(async () => {
      session = await page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.startsWith('lingvohero.learning.v3:'))!;
        return JSON.parse(localStorage.getItem(key)!).state.session;
      });
      return session && !session.correct && session.exerciseIndex === n! - 1;
    })
    .toBe(true);
  await solve(page, currentExercise(session!), session!.lesson);
}
