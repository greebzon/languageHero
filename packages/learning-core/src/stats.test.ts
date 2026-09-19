import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSchema } from '@lingvohero/contracts';
import seed from '../../../content/seed.json';
import { newLearningState } from './course';
import { emptyJournal, recordLesson } from './journal';
import { bestStreak, childStats } from './stats';

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);

test('child statistics: lessons, stars, sets, streaks, trophies and the current week', () => {
  const catalog = catalogSchema.parse(seed.catalog);
  const lessons = catalog.courses[0]!.lessons;
  const state = newLearningState();
  state.progress[lessons[0]!.id] = { bestStars: 3, completedVersion: 1 };
  state.progress[lessons[1]!.id] = { bestStars: 2, completedVersion: 1 };
  let journal = emptyJournal();
  // A three-day run (14-16), a gap, then two days (17 is empty; 18-19). 19 is a Saturday.
  for (const day of [14, 15, 16, 18, 19])
    journal = recordLesson(journal, { firstTime: true, words: 4, perfect: false, at: at(day) });
  journal = recordLesson(journal, { firstTime: false, words: 4, perfect: true, at: at(19, 19) });
  journal = { ...journal, trophies: { owl: '2026-09-19' } };

  const stats = childStats(catalog, state, journal, 'en', at(19), 8);
  assert.equal(stats.words, 8);
  assert.deepEqual(stats.lessons, { done: 2, total: lessons.length });
  assert.deepEqual(stats.stars, { earned: 5, max: lessons.length * 3 });
  assert.equal(stats.perfect, 1);
  assert.deepEqual(stats.sets, { done: 0, total: 1 });
  assert.deepEqual(stats.streak, { current: 2, best: 3 });
  assert.equal(stats.activeDays, 5);
  assert.equal(stats.plays, 6);
  assert.equal(stats.trophies.earned, 1);
  // Monday 14 … Sunday 20; today is Saturday.
  assert.deepEqual(
    stats.week.map((d) => [d.label, d.lessons, d.today]),
    [
      ['Пн', 1, false],
      ['Вт', 1, false],
      ['Ср', 1, false],
      ['Чт', 0, false],
      ['Пт', 1, false],
      ['Сб', 2, true],
      ['Вс', 0, false],
    ],
  );
  // A spent freeze keeps a run going; another language has nothing yet.
  const frozen = {
    ...journal,
    days: {
      ...journal.days,
      '2026-09-17': { lessons: 0, perfect: 0, words: 0, evening: false, frozen: true },
    },
  };
  assert.equal(bestStreak(frozen), 6);
  assert.deepEqual(childStats(catalog, state, journal, 'de', at(19), 0).lessons, {
    done: 0,
    total: 0,
  });
});
