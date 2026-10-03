import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardTrophies,
  buildJournal,
  claimQuest,
  dayKey,
  emptyJournal,
  hoursUntilMidnight,
  questProgress,
  recordLesson,
  restoreJournal,
  streakDays,
  trophyProgress,
  wallClock,
} from './journal';

const noon = (day: number) => new Date(2026, 8, day, 12, 0, 0);

test('daily quests count today only and pay out once', () => {
  let j = emptyJournal();
  j = recordLesson(j, { firstTime: true, words: 4, perfect: true, stars: 3, at: noon(18) });
  j = recordLesson(j, { firstTime: false, words: 4, perfect: false, stars: 1, at: noon(18) });
  j = recordLesson(j, { firstTime: true, words: 6, perfect: true, stars: 3, at: noon(17) });
  const today = questProgress(j, noon(18));
  assert.deepEqual(
    today.map((q) => [q.quest.id, q.value, q.done]),
    [
      ['lesson', 1, true],
      ['words', 4, false],
      ['perfect', 1, false],
    ],
  );
  const claimed = claimQuest(j, 'lesson', noon(18));
  assert.equal(claimed.bonusCoins, 20);
  assert.equal(claimQuest(claimed, 'lesson', noon(18)), claimed);
  assert.equal(claimQuest(claimed, 'words', noon(18)), claimed);
  assert.equal(questProgress(claimed, noon(18))[0].claimed, true);
  assert.equal(questProgress(claimed, noon(19))[0].value, 0);
});

test('streak counts consecutive days and survives the morning before the first lesson', () => {
  let j = emptyJournal();
  for (const day of [14, 15, 16])
    j = recordLesson(j, { firstTime: true, words: 1, perfect: false, stars: 1, at: noon(day) });
  assert.equal(streakDays(j, noon(16)), 3);
  assert.equal(streakDays(j, noon(17)), 3);
  assert.equal(streakDays(j, noon(18)), 0);
});

test('trophies are earned once, keep their reward and stay when the streak breaks', () => {
  let j = emptyJournal();
  for (let day = 10; day < 17; day++)
    j = recordLesson(j, {
      firstTime: true,
      words: 8,
      perfect: true,
      stars: 3,
      at: new Date(2026, 8, day, 19),
    });
  const before = trophyProgress(j, noon(16), 56);
  assert.deepEqual(
    before.map((t) => [t.trophy.id, t.value, t.earned]),
    [
      ['wizard', 50, false],
      ['streak', 7, false],
      ['sniper', 7, false],
      ['owl', 1, false],
    ],
  );
  const awarded = awardTrophies(j, noon(16), 56);
  assert.equal(awarded.bonusCoins, 100 + 50 + 30);
  assert.deepEqual(Object.keys(awarded.trophies).sort(), ['owl', 'streak', 'wizard']);
  assert.equal(awardTrophies(awarded, noon(16), 56), awarded);
  const later = trophyProgress(awarded, noon(30), 56);
  assert.equal(later.find((t) => t.trophy.id === 'streak')?.value, 7);
  assert.equal(later.find((t) => t.trophy.id === 'sniper')?.value, 7);
});

test('journal restores defensively and dates use the local calendar', () => {
  assert.deepEqual(restoreJournal(null), emptyJournal());
  assert.deepEqual(restoreJournal({ version: 2 }), emptyJournal());
  const partial = restoreJournal({ version: 1, days: { '2026-09-18': { lessons: 1 } } });
  assert.equal(partial.bonusCoins, 0);
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(hoursUntilMidnight(new Date(2026, 8, 18, 19, 10)), 5);
  assert.equal(hoursUntilMidnight(new Date(2026, 8, 18, 23, 59)), 1);
});

test('buildJournal rebuilds days and coins from verified completions and the ledger', () => {
  const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
  const journal = buildJournal(
    [
      { lessonId: 'a', words: 4, perfect: true, stars: 3, at: at(18, 19) },
      { lessonId: 'a', words: 4, perfect: false, stars: 1, at: at(18) },
      { lessonId: 'b', words: 3, perfect: true, stars: 3, at: at(17) },
    ],
    [
      { kind: 'quest', ref: 'lesson', day: '2026-09-18', coins: 20, itemId: null },
      { kind: 'trophy', ref: 'owl', day: '2026-09-18', coins: 30, itemId: null },
      { kind: 'purchase', ref: 'freeze', day: '2026-09-18', coins: -200, itemId: null },
      { kind: 'purchase', ref: 'cap', day: '2026-09-18', coins: -150, itemId: 'cap' },
      { kind: 'chest', ref: 'chest', day: '2026-09-18', coins: -100, itemId: 'crown' },
      { kind: 'freeze', ref: 'freeze', day: '2026-09-16', coins: 0, itemId: null },
    ],
  );
  assert.deepEqual(journal.days['2026-09-18'], { lessons: 2, perfect: 1, words: 4, evening: true });
  assert.deepEqual(journal.days['2026-09-17'], {
    lessons: 1,
    perfect: 1,
    words: 3,
    evening: false,
  });
  assert.equal(journal.days['2026-09-16']?.frozen, true);
  assert.deepEqual(journal.claimedQuests, { '2026-09-18': ['lesson'] });
  assert.deepEqual(journal.trophies, { owl: '2026-09-18' });
  assert.equal(journal.bonusCoins, 50);
  assert.equal(journal.spentCoins, 450);
  assert.deepEqual(journal.inventory, { items: ['cap', 'crown'], freezes: 0 });
  assert.equal(streakDays(journal, at(18)), 3);
});

test('wallClock shows the learner’s local calendar regardless of the server zone', () => {
  const utc = new Date(Date.UTC(2026, 8, 18, 22, 30));
  assert.equal(dayKey(wallClock(utc, 180)), '2026-09-19');
  assert.equal(dayKey(wallClock(utc, -300)), '2026-09-18');
  assert.equal(wallClock(utc, 180).getHours(), 1);
  assert.equal(wallClock(utc, 0).getHours(), 22);
});
