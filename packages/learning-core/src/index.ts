import { demoStateSchema, type DemoState, type LessonPackage } from '@lingvohero/contracts';
export * from './course';
export * from './levels';
export * from './journal';
export * from './shop';
export * from './outfit';
import { starsFor } from './scoring';
export { starsFor } from './scoring';

export function initialState(): DemoState {
  return { version: 1, soundEnabled: true, completed: false, bestStars: 0, session: null };
}

export type LessonAction =
  | { type: 'start' }
  | { type: 'answer'; choiceId: string }
  | { type: 'next' }
  | { type: 'sound'; enabled: boolean };

export function transition(
  state: DemoState,
  action: LessonAction,
  lesson: LessonPackage,
): DemoState {
  if (action.type === 'sound') return { ...state, soundEnabled: action.enabled };
  if (action.type === 'start') {
    if (state.session && !state.session.finished) return state;
    return {
      ...state,
      session: {
        lessonId: lesson.id,
        contentVersion: lesson.version,
        exerciseIndex: 0,
        mistakes: 0,
        correct: false,
        finished: false,
      },
    };
  }
  const session = state.session;
  if (!session || session.finished) return state;
  const exercise = lesson.exercises[session.exerciseIndex];
  if (!exercise) return state;
  if (action.type === 'answer') {
    if (session.correct || !exercise.choices.some((choice) => choice.id === action.choiceId))
      return state;
    const correct = action.choiceId === exercise.correctChoiceId;
    return {
      ...state,
      session: { ...session, correct, mistakes: session.mistakes + (correct ? 0 : 1) },
    };
  }
  if (!session.correct) return state;
  if (session.exerciseIndex === lesson.exercises.length - 1) {
    return {
      ...state,
      completed: true,
      bestStars: Math.max(state.bestStars, starsFor(session.mistakes)),
      session: { ...session, finished: true },
    };
  }
  return {
    ...state,
    session: { ...session, exerciseIndex: session.exerciseIndex + 1, correct: false },
  };
}

export function restoreState(value: unknown, lesson: LessonPackage): DemoState | null {
  const result = demoStateSchema.safeParse(value);
  if (!result.success) return null;
  const { session } = result.data;
  if (
    session &&
    (session.lessonId !== lesson.id ||
      session.contentVersion !== lesson.version ||
      session.exerciseIndex >= lesson.exercises.length ||
      (session.finished &&
        (!session.correct ||
          session.exerciseIndex !== lesson.exercises.length - 1 ||
          !result.data.completed)))
  )
    return null;
  return result.data;
}

export function demoRewards(state: DemoState) {
  // A single completion flag is the source of truth; repeat play cannot mint coins.
  return { xp: state.completed ? 100 : 0, coins: state.completed ? 30 : 0, stars: state.bestStars };
}
export { courseCards, reconcileCourseAccess } from './catalog';
export * from './stats';
