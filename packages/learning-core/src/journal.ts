/* Activity journal behind «Сокровищница»: daily quests and trophies. The server builds it from
   verified attempts and the coin ledger (buildJournal); the client shows it and extends it
   optimistically for lessons that are not synced yet. */
import type { Journal, JournalDay } from '@lingvohero/contracts';
export type { Journal, JournalDay };
/* Journal shape (see journalSchema in contracts): days by local day key; claimedQuests: day → quest ids;
   trophies: trophy id → day earned; bonusCoins from quests/trophies; spentCoins and inventory from the shop;
   a `frozen` day is a skipped day covered by a streak freeze. */
export type Quest = {
  id: string;
  title: string;
  metric: keyof Pick<JournalDay, 'lessons' | 'perfect' | 'words'>;
  target: number;
  reward: number;
};
export type Trophy = {
  id: string;
  title: string;
  description: string;
  icon: string;
  metric: 'wordsTotal' | 'streak' | 'perfectTotal' | 'evening';
  target: number;
  reward: number;
};
export const QUESTS: Quest[] = [
  { id: 'lesson', title: 'Пройди 1 урок сегодня', metric: 'lessons', target: 1, reward: 20 },
  { id: 'words', title: 'Выучи 5 новых слов сегодня', metric: 'words', target: 5, reward: 50 },
  { id: 'perfect', title: 'Пройди 2 урока без ошибок', metric: 'perfect', target: 2, reward: 30 },
];
export const TROPHIES: Trophy[] = [
  {
    id: 'wizard',
    title: 'Словесный маг',
    description: 'Выучено 50 слов',
    icon: '🏆',
    metric: 'wordsTotal',
    target: 50,
    reward: 100,
  },
  {
    id: 'streak',
    title: 'Неугомонный',
    description: 'Серия занятий 7 дней подряд',
    icon: '🔥',
    metric: 'streak',
    target: 7,
    reward: 50,
  },
  {
    id: 'sniper',
    title: 'Супер-снайпер',
    description: '10 идеальных уроков',
    icon: '🎯',
    metric: 'perfectTotal',
    target: 10,
    reward: 80,
  },
  {
    id: 'owl',
    title: 'Ночной знаток',
    description: 'Заверши урок после 18:00',
    icon: '🦉',
    metric: 'evening',
    target: 1,
    reward: 30,
  },
];
export function emptyJournal(): Journal {
  return {
    version: 1,
    days: {},
    claimedQuests: {},
    trophies: {},
    bonusCoins: 0,
    spentCoins: 0,
    inventory: { items: [], freezes: 0 },
  };
}
export function restoreJournal(value: unknown): Journal {
  const j = value as Partial<Journal> | null;
  if (!j || j.version !== 1 || typeof j.days !== 'object' || !j.days) return emptyJournal();
  return {
    version: 1,
    days: j.days,
    claimedQuests: j.claimedQuests ?? {},
    trophies: j.trophies ?? {},
    bonusCoins: typeof j.bonusCoins === 'number' ? j.bonusCoins : 0,
    spentCoins: typeof j.spentCoins === 'number' ? j.spentCoins : 0,
    inventory: {
      items: Array.isArray(j.inventory?.items)
        ? j.inventory.items.filter((i): i is string => typeof i === 'string')
        : [],
      freezes: typeof j.inventory?.freezes === 'number' ? j.inventory.freezes : 0,
    },
  };
}
/* Local calendar date, so «сегодня» matches what the child sees on the clock. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}
function shift(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export function recordLesson(
  journal: Journal,
  lesson: { firstTime: boolean; words: number; perfect: boolean; at: Date },
): Journal {
  const key = dayKey(lesson.at);
  const day = journal.days[key] ?? { lessons: 0, perfect: 0, words: 0, evening: false };
  return {
    ...journal,
    days: {
      ...journal.days,
      [key]: {
        lessons: day.lessons + 1,
        perfect: day.perfect + (lesson.perfect ? 1 : 0),
        words: day.words + (lesson.firstTime ? lesson.words : 0),
        evening: day.evening || lesson.at.getHours() >= 18,
      },
    },
  };
}
/* Consecutive active days ending today; a streak that ended yesterday still counts,
   so the child sees «6 дней» in the morning before the first lesson. */
export function streakDays(journal: Journal, today: Date): number {
  let cursor = journal.days[dayKey(today)]?.lessons ? today : shift(today, -1);
  let count = 0;
  while (journal.days[dayKey(cursor)]?.lessons || journal.days[dayKey(cursor)]?.frozen) {
    count += 1;
    cursor = shift(cursor, -1);
  }
  return count;
}
export function hoursUntilMidnight(now: Date): number {
  const midnight = shift(now, 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 3600000));
}
export function questProgress(journal: Journal, today: Date) {
  const key = dayKey(today);
  const day = journal.days[key];
  const claimed = journal.claimedQuests[key] ?? [];
  return QUESTS.map((quest) => {
    const value = Math.min(quest.target, day?.[quest.metric] ?? 0);
    return { quest, value, done: value >= quest.target, claimed: claimed.includes(quest.id) };
  });
}
export function claimQuest(journal: Journal, questId: string, today: Date): Journal {
  const key = dayKey(today);
  const entry = questProgress(journal, today).find((q) => q.quest.id === questId);
  if (!entry || !entry.done || entry.claimed) return journal;
  return {
    ...journal,
    claimedQuests: {
      ...journal.claimedQuests,
      [key]: [...(journal.claimedQuests[key] ?? []), questId],
    },
    bonusCoins: journal.bonusCoins + entry.quest.reward,
  };
}
function trophyMetric(journal: Journal, today: Date, wordsTotal: number, metric: Trophy['metric']) {
  const days = Object.values(journal.days);
  if (metric === 'wordsTotal') return wordsTotal;
  if (metric === 'streak') return streakDays(journal, today);
  if (metric === 'perfectTotal') return days.reduce((sum, d) => sum + d.perfect, 0);
  return days.some((d) => d.evening) ? 1 : 0;
}
export function trophyProgress(journal: Journal, today: Date, wordsTotal: number) {
  return TROPHIES.map((trophy) => {
    const earned = trophy.id in journal.trophies;
    const value = earned
      ? trophy.target
      : Math.min(trophy.target, trophyMetric(journal, today, wordsTotal, trophy.metric));
    return { trophy, value, earned };
  });
}
/* Trophies are granted the moment their goal is met; a streak trophy stays even if the streak breaks. */
export function awardTrophies(journal: Journal, today: Date, wordsTotal: number): Journal {
  let next = journal;
  for (const { trophy, value, earned } of trophyProgress(journal, today, wordsTotal))
    if (!earned && value >= trophy.target)
      next = {
        ...next,
        trophies: { ...next.trophies, [trophy.id]: dayKey(today) },
        bonusCoins: next.bonusCoins + trophy.reward,
      };
  return next;
}

/* A Date whose local getters show the learner's wall clock (tzOffset = minutes east of UTC),
   so dayKey() on the server matches what the child sees on the device. */
export function wallClock(utc: Date, tzOffset: number): Date {
  const shifted = new Date(utc.getTime() + tzOffset * 60000);
  return new Date(shifted.getTime() + shifted.getTimezoneOffset() * 60000);
}
export type LedgerEntry = {
  kind: 'quest' | 'trophy' | 'purchase' | 'chest' | 'freeze';
  ref: string;
  day: string;
  coins: number;
  itemId: string | null;
};
export type Completion = { lessonId: string; words: number; perfect: boolean; at: Date };
/* Rebuilds the journal from verified lesson completions (wall-clock dates) and the coin ledger. */
export function buildJournal(completions: Completion[], ledger: LedgerEntry[]): Journal {
  let journal = emptyJournal();
  const seen = new Set<string>();
  for (const c of [...completions].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    journal = recordLesson(journal, { ...c, firstTime: !seen.has(c.lessonId) });
    seen.add(c.lessonId);
  }
  const claimedQuests: Record<string, string[]> = {};
  const trophies: Record<string, string> = {};
  const items: string[] = [];
  let bonusCoins = 0;
  let spentCoins = 0;
  let freezes = 0;
  const days = { ...journal.days };
  for (const entry of ledger) {
    if (entry.kind === 'quest') {
      (claimedQuests[entry.day] ??= []).push(entry.ref);
      bonusCoins += entry.coins;
    } else if (entry.kind === 'trophy') {
      trophies[entry.ref] = entry.day;
      bonusCoins += entry.coins;
    } else if (entry.kind === 'freeze') {
      freezes -= 1;
      days[entry.day] ??= { lessons: 0, perfect: 0, words: 0, evening: false };
      days[entry.day] = { ...days[entry.day], frozen: true };
    } else {
      spentCoins -= entry.coins;
      if (entry.ref === 'freeze') freezes += 1;
      if (entry.itemId) items.push(entry.itemId);
    }
  }
  return {
    version: 1,
    days,
    claimedQuests,
    trophies,
    bonusCoins,
    spentCoins,
    inventory: { items, freezes: Math.max(0, freezes) },
  };
}
