/* «Моя статистика» in the profile: numbers a child (and a parent looking over their shoulder)
   can read at a glance. Pure: everything comes from the verified learning state and the
   server-built journal, so every device shows the same figures. */
import type { Catalog, Journal, LearningState } from '@lingvohero/contracts';
import { courseCards } from './catalog';
import { TROPHIES, dayKey, streakDays } from './journal';

export type WeekDay = {
  key: string;
  /** Short weekday name, «Пн»…«Вс». */
  label: string;
  lessons: number;
  frozen: boolean;
  today: boolean;
};
export type ChildStats = {
  words: number;
  /** Lessons finished at least once, out of all lessons of the language. */
  lessons: { done: number; total: number };
  stars: { earned: number; max: number };
  /** Lessons finished with three stars. */
  perfect: number;
  sets: { done: number; total: number };
  streak: { current: number; best: number };
  /** Days with at least one finished lesson. */
  activeDays: number;
  /** Lessons played including repeats. */
  plays: number;
  trophies: { earned: number; total: number };
  /** Monday to Sunday of the current week. */
  week: WeekDay[];
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function shift(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Longest run of consecutive days with a lesson (a spent streak freeze keeps the run). */
export function bestStreak(journal: Journal): number {
  const keys = Object.keys(journal.days)
    .filter((k) => journal.days[k]!.lessons > 0 || journal.days[k]!.frozen)
    .sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of keys) {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    const date = new Date(y, m - 1, d);
    run = previous && dayKey(shift(previous, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

export function childStats(
  catalog: Catalog,
  state: LearningState,
  journal: Journal,
  language: string,
  today: Date,
  wordsTotal: number,
): ChildStats {
  const cards = courseCards(catalog, state, language);
  const lessons = cards.flatMap((c) => c.course.lessons);
  const done = lessons.filter((l) => state.progress[l.id]);
  const monday = shift(today, -((today.getDay() + 6) % 7));
  const current = streakDays(journal, today);
  const days = Object.values(journal.days);
  return {
    words: wordsTotal,
    lessons: { done: done.length, total: lessons.length },
    stars: {
      earned: done.reduce((sum, l) => sum + state.progress[l.id]!.bestStars, 0),
      max: lessons.length * 3,
    },
    perfect: done.filter((l) => state.progress[l.id]!.bestStars === 3).length,
    sets: { done: cards.filter((c) => c.complete).length, total: cards.length },
    streak: { current, best: Math.max(current, bestStreak(journal)) },
    activeDays: days.filter((d) => d.lessons > 0).length,
    plays: days.reduce((sum, d) => sum + d.lessons, 0),
    trophies: {
      earned: TROPHIES.filter((t) => journal.trophies[t.id]).length,
      total: TROPHIES.length,
    },
    week: WEEKDAYS.map((label, i) => {
      const date = shift(monday, i);
      const key = dayKey(date);
      return {
        key,
        label,
        lessons: journal.days[key]?.lessons ?? 0,
        frozen: !!journal.days[key]?.frozen,
        today: key === dayKey(today),
      };
    }),
  };
}
