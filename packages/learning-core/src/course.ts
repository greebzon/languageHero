import {
  demoStateSchema,
  learningStateSchema,
  type Answer,
  type CourseExercise,
  type CourseLesson,
  type Difficulty,
  type LearningState,
  type Review,
} from '@lingvohero/contracts';
import { adaptExercise, assessExercise, type Assessment } from './mechanics';
import { RECENT_RUNS } from './age';
import { starsFor } from './scoring';

export function newLearningState(): LearningState {
  return { version: 2, soundEnabled: true, progress: {}, session: null };
}
export function assess(exercise: CourseExercise, answer: Answer, lesson: CourseLesson): Assessment {
  return assessExercise(exercise, answer, lesson);
}
type Session = NonNullable<LearningState['session']>;
/**
 * The exercises a child of this age group plays, in lesson order (an exercise may be meant for
 * one age group only). Without an age the older group's are played.
 */
export function playableIndices(lesson: CourseLesson, difficulty?: Pick<Difficulty, 'ageBand'>) {
  const band = difficulty?.ageBand ?? '8-9';
  return lesson.exercises.flatMap((e, i) => (!e.ageBands || e.ageBands.includes(band) ? [i] : []));
}
/** The session has gone past its exercises and repeats the ones answered wrong. */
export const inReview = (session: Session) =>
  session.exerciseIndex >= playableIndices(session.lesson, session.difficulty).length;
/**
 * The exercise in front of the child, eased for the session's age group. `lesson` may be the
 * session's lesson in the interface language: easing only touches structure, not texts.
 */
export function currentExercise(session: Session, lesson: CourseLesson = session.lesson) {
  const exercise = lesson.exercises[session.queue[session.exerciseIndex]];
  return adaptExercise(
    exercise,
    lesson,
    session.difficulty,
    `${session.difficulty?.seed}:${exercise.id}`,
  );
}
export type LearningAction =
  | {
      type: 'start';
      lesson: CourseLesson;
      attemptId?: string;
      /** Without a seed the attempt id (or the lesson id) becomes the seed. */
      difficulty?: Pick<Difficulty, 'ageBand'> & { seed?: string };
      /** A review (`composeReview`): what it was assembled from. */
      review?: Review;
    }
  | { type: 'draft'; answer: Answer | null }
  | { type: 'answer' }
  | { type: 'next' }
  | { type: 'sound'; enabled: boolean };
export function learn(state: LearningState, action: LearningAction): LearningState {
  if (action.type === 'sound') return { ...state, soundEnabled: action.enabled };
  if (action.type === 'start') {
    // Keep a single unfinished, immutable lesson. The map offers to resume it.
    if (state.session && !state.session.finished) return state;
    return {
      ...state,
      session: {
        ...(action.attemptId ? { attemptId: action.attemptId } : {}),
        ...(action.difficulty
          ? {
              difficulty: {
                ageBand: action.difficulty.ageBand,
                seed: action.difficulty.seed ?? action.attemptId ?? action.lesson.id,
              },
            }
          : {}),
        ...(action.review ? { review: action.review } : {}),
        events: [],
        lesson: action.lesson,
        queue: playableIndices(action.lesson, action.difficulty),
        exerciseIndex: 0,
        mistakes: 0,
        correct: false,
        finished: false,
        draft: null,
      },
    };
  }
  const session = state.session;
  if (!session || session.finished) return state;
  const exercise = currentExercise(session);
  if (action.type === 'draft')
    return session.correct ? state : { ...state, session: { ...session, draft: action.answer } };
  if (action.type === 'answer') {
    if (session.correct || !session.draft) return state;
    const result = assess(exercise, session.draft, session.lesson);
    if (result === 'invalid') return state;
    const queue = [...session.queue];
    const sourceIndex = queue[session.exerciseIndex];
    const played = playableIndices(session.lesson, session.difficulty).length;
    if (result === 'wrong' && !queue.slice(played).includes(sourceIndex)) queue.push(sourceIndex);
    return {
      ...state,
      session: {
        ...session,
        queue,
        correct: result === 'correct',
        events: [...(session.events ?? []), { type: 'answer', answer: session.draft }],
        mistakes: session.mistakes + (result === 'wrong' ? 1 : 0),
      },
    };
  }
  if (!session.correct) return state;
  if (session.exerciseIndex + 1 < session.queue.length)
    return {
      ...state,
      session: {
        ...session,
        exerciseIndex: session.exerciseIndex + 1,
        events: [...(session.events ?? []), { type: 'next' }],
        correct: false,
        draft: null,
      },
    };
  return {
    ...state,
    recent: [...(state.recent ?? []), starsFor(session.mistakes)].slice(-RECENT_RUNS),
    // A review is not a lesson of the map: it leaves no progress entry (and so no XP or coins).
    progress: session.review
      ? state.progress
      : {
          ...state.progress,
          [session.lesson.id]: {
            bestStars: Math.max(
              state.progress[session.lesson.id]?.bestStars ?? 0,
              starsFor(session.mistakes),
            ),
            completedVersion: session.lesson.version,
          },
        },
    session: { ...session, finished: true, events: [...(session.events ?? []), { type: 'next' }] },
  };
}
export function learningRewards(state: LearningState) {
  const completed = Object.values(state.progress);
  return {
    xp: completed.length * 100,
    coins: completed.length * 30,
    stars: completed.reduce((sum, p) => sum + p.bestStars, 0),
    lessons: completed.length,
  };
}
export function restoreLearningState(value: unknown): LearningState | null {
  const parsed = learningStateSchema.safeParse(value);
  if (!parsed.success) return null;
  const state = parsed.data;
  const s = state.session;
  if (s) {
    const playable = playableIndices(s.lesson, s.difficulty);
    const n = playable.length;
    if (
      s.queue.length < n ||
      s.queue.slice(0, n).some((i, j) => i !== playable[j]) ||
      s.queue.slice(n).some((i) => !playable.includes(i)) ||
      new Set(s.queue.slice(n)).size !== s.queue.length - n ||
      s.exerciseIndex >= s.queue.length ||
      (s.finished &&
        (!s.correct ||
          s.exerciseIndex !== s.queue.length - 1 ||
          (!s.review && !state.progress[s.lesson.id]))) ||
      (s.correct && (!s.draft || assess(currentExercise(s), s.draft, s.lesson) !== 'correct'))
    )
      return null;
  }
  return state;
}
export function migrateDemo(value: unknown, lesson: CourseLesson): LearningState | null {
  const result = demoStateSchema.safeParse(value);
  if (!result.success) return null;
  const old = result.data;
  const state = newLearningState();
  state.soundEnabled = old.soundEnabled;
  if (old.completed)
    state.progress[lesson.id] = {
      bestStars: Math.max(1, old.bestStars),
      completedVersion: lesson.version,
    };
  const s = old.session;
  if (
    s &&
    s.lessonId === lesson.id &&
    s.contentVersion === 1 &&
    s.exerciseIndex < lesson.exercises.length
  ) {
    const ex = lesson.exercises[s.exerciseIndex];
    state.session = {
      lesson,
      queue: lesson.exercises.map((_, i) => i),
      exerciseIndex: s.exerciseIndex,
      mistakes: s.mistakes,
      correct: s.correct,
      finished: s.finished,
      draft: s.correct && ex.type === 'listen-and-select' ? { choiceId: ex.wordId } : null,
    };
  }
  return restoreLearningState(state);
}
