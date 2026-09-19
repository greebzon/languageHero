import test from 'node:test';
import assert from 'node:assert/strict';
import { accountLevel, levelStartXp } from './levels';

test('first lesson levels up; thresholds grow to five lessons and then stay bounded', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8].map(levelStartXp), [0, 100, 300, 600, 1000, 1500, 2500]);
  for (let level = 2; level <= 100; level++) {
    const threshold = levelStartXp(level);
    assert.equal(accountLevel(threshold - 1).level, level - 1);
    assert.equal(accountLevel(threshold).level, level);
    assert.equal(accountLevel(threshold).levelStartXp, threshold);
    assert.ok(accountLevel(threshold).nextLevelXp > threshold);
  }
});

test('a previously earned level never falls when changing the XP curve', () => {
  assert.deepEqual(accountLevel(3000, 11), { level: 11, levelStartXp: 4000, nextLevelXp: 4500 });
  assert.equal(accountLevel(4500, 11).level, 12);
});
