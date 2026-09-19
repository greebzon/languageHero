import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyJournal, recordLesson, streakDays, type Journal } from './journal';
import { buyItem, coinBalance, dailyDeal, priceFor, protectStreak, shopItem } from './shop';

const noon = (day: number) => new Date(2026, 8, day, 12);

test('the daily deal rotates and halves the price of one wardrobe item', () => {
  const a = dailyDeal(noon(18))!;
  const b = dailyDeal(noon(19))!;
  assert.notEqual(a.item.id, b.item.id);
  assert.equal(a.item.kind, 'wardrobe');
  assert.equal(a.price, Math.round(a.item.price / 2));
  assert.equal(priceFor(a.item, noon(18)), a.price);
  assert.equal(priceFor(a.item, noon(19)), a.item.price);
  assert.equal(dailyDeal(noon(18))!.item.id, a.item.id);
});

test('purchases spend coins, refuse when poor or already owned, and chests grant new items', () => {
  const j = { ...emptyJournal(), bonusCoins: 400 };
  const cap = shopItem('cap')!;
  const price = priceFor(cap, noon(18));
  const bought = buyItem(j, 'cap', noon(18), 0);
  assert.equal(bought.outcome, 'ok');
  assert.deepEqual(bought.journal.inventory.items, ['cap']);
  assert.equal(coinBalance(bought.journal, 0), 400 - price);
  assert.equal(buyItem(bought.journal, 'cap', noon(18), 0).outcome, 'owned');
  assert.equal(buyItem(bought.journal, 'astronaut', noon(18), 0).outcome, 'poor');
  const chest = buyItem(bought.journal, 'chest', noon(18), 0, { random: () => 0.999 });
  assert.equal(chest.outcome, 'ok');
  assert.ok(chest.granted && chest.granted.kind === 'wardrobe' && chest.granted.id !== 'cap');
  assert.equal(chest.journal.inventory.items.length, 2);
  assert.equal(coinBalance(chest.journal, 0), 400 - price - 100);
  const freeze = buyItem(chest.journal, 'freeze', noon(18), 200);
  assert.equal(freeze.outcome, 'ok');
  assert.equal(freeze.journal.inventory.freezes, 1);
  const rich = { ...emptyJournal(), bonusCoins: 10000 };
  let all = rich;
  for (const id of ['astronaut', 'cape', 'crown', 'glasses', 'cap'])
    all = buyItem(all, id, noon(18), 0).journal;
  assert.equal(buyItem(all, 'chest', noon(18), 0).outcome, 'nothing');
});

test('a streak freeze covers one skipped day and is consumed once', () => {
  let j: Journal = { ...emptyJournal(), inventory: { items: [], freezes: 1 } };
  j = recordLesson(j, { firstTime: true, words: 1, perfect: false, at: noon(15) });
  j = recordLesson(j, { firstTime: true, words: 1, perfect: false, at: noon(16) });
  assert.equal(streakDays(j, noon(18)), 0);
  const kept = protectStreak(j, noon(18));
  assert.equal(kept.inventory.freezes, 0);
  assert.equal(kept.days['2026-09-17']?.frozen, true);
  assert.equal(streakDays(kept, noon(18)), 3);
  assert.equal(protectStreak(kept, noon(18)), kept);
  const afterLesson = recordLesson(kept, {
    firstTime: false,
    words: 0,
    perfect: true,
    at: noon(18),
  });
  assert.equal(streakDays(afterLesson, noon(18)), 4);
  const none: Journal = { ...j, inventory: { items: [], freezes: 0 } };
  assert.equal(protectStreak(none, noon(18)), none);
});
