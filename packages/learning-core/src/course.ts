import {
  demoStateSchema,
  learningStateSchema,
  type Answer,
  type CourseExercise,
  type CourseLesson,
  type LearningState,
} from '@lingvohero/contracts';
import { starsFor } from './scoring';

export function newLearningState(): LearningState {
  return { version: 2, soundEnabled: true, progress: {}, session: null };
}
export function assess(
  exercise: CourseExercise,
  answer: Answer,
  lesson: CourseLesson,
): 'correct' | 'wrong' | 'invalid' {
  if (exercise.type === 'listen-and-select') {
    if (!('choiceId' in answer) || !exercise.choices.includes(answer.choiceId)) return 'invalid';
    return answer.choiceId === exercise.wordId ? 'correct' : 'wrong';
  }
  if (exercise.type === 'match-pairs') {
    if (
      !('pairs' in answer) ||
      Object.keys(answer.pairs).length !== exercise.wordIds.length ||
      exercise.wordIds.some((id) => !exercise.imageOrder.includes(answer.pairs[id])) ||
      new Set(Object.values(answer.pairs)).size !== exercise.wordIds.length
    )
      return 'invalid';
    return exercise.wordIds.every((id) => answer.pairs[id] === id) ? 'correct' : 'wrong';
  }
  if (
    !('tileIds' in answer) ||
    answer.tileIds.length === 0 ||
    new Set(answer.tileIds).size !== answer.tileIds.length ||
    answer.tileIds.some((id) => !exercise.tiles.some((t) => t.id === id))
  )
    return 'invalid';
  const text = answer.tileIds
    .map((id) => exercise.tiles.find((t) => t.id === id)!.letter)
    .join('')
    .normalize('NFC');
  return text === lesson.words.find((w) => w.id === exercise.wordId)!.spelling.normalize('NFC')
    ? 'correct'
    : 'wrong';
}
export type LearningAction =
  | { type: 'start'; lesson: CourseLesson; attemptId?: string }
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
        events: [],
        lesson: action.lesson,
        queue: action.lesson.exercises.map((_, i) => i),
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
  const exercise = session.lesson.exercises[session.queue[session.exerciseIndex]];
  if (action.type === 'draft')
    return session.correct ? state : { ...state, session: { ...session, draft: action.answer } };
  if (action.type === 'answer') {
    if (session.correct || !session.draft) return state;
    const result = assess(exercise, session.draft, session.lesson);
    if (result === 'invalid') return state;
    const queue = [...session.queue];
    const sourceIndex = queue[session.exerciseIndex];
    if (result === 'wrong' && !queue.slice(session.lesson.exercises.length).includes(sourceIndex))
      queue.push(sourceIndex);
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
    progress: {
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
    const n = s.lesson.exercises.length;
    if (
      s.queue.length < n ||
      s.queue.some((i) => i >= n) ||
      s.queue.slice(0, n).some((i, j) => i !== j) ||
      new Set(s.queue.slice(n)).size !== s.queue.length - n ||
      s.exerciseIndex >= s.queue.length ||
      (s.finished &&
        (!s.correct || s.exerciseIndex !== s.queue.length - 1 || !state.progress[s.lesson.id])) ||
      (s.correct &&
        (!s.draft ||
          assess(s.lesson.exercises[s.queue[s.exerciseIndex]], s.draft, s.lesson) !== 'correct'))
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
