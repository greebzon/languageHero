import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOT_ORDER,
  cleanOutfit,
  equip,
  isEquipped,
  outfitLayers,
  unequip,
  wornCount,
} from './outfit';

const items = [
  { id: 'cap', slot: 'head' as const },
  { id: 'crown', slot: 'head' as const },
  { id: 'glasses', slot: 'eyes' as const },
  { id: 'cape', slot: 'back' as const },
];

test('one item per slot: a new hat replaces the old one, unequip frees the slot', () => {
  let outfit = equip({}, items[0]!);
  outfit = equip(outfit, items[2]!);
  assert.deepEqual(outfit, { head: 'cap', eyes: 'glasses' });
  outfit = equip(outfit, items[1]!);
  assert.equal(outfit.head, 'crown');
  assert.equal(isEquipped(outfit, 'cap'), false);
  assert.equal(isEquipped(outfit, 'crown'), true);
  assert.equal(wornCount(outfit), 2);
  assert.deepEqual(unequip(outfit, 'head'), { eyes: 'glasses' });
});

test('cleanOutfit keeps only owned items that still exist in their slot', () => {
  const dirty = { head: 'cap', eyes: 'cape', back: 'gone', outfit: 'crown' };
  assert.deepEqual(cleanOutfit(dirty, items, ['cap', 'cape', 'crown']), { head: 'cap' });
  assert.deepEqual(cleanOutfit({ head: 'cap' }, items, []), {});
});

test('layers come out bottom to top and a preview swaps its slot only', () => {
  const layers = [
    { mascotId: 'fox', itemId: 'cap', path: '/cap', box: { x: 0, y: 0, w: 1, h: 0.2 } },
    { mascotId: 'fox', itemId: 'crown', path: '/crown', box: { x: 0, y: 0, w: 1, h: 0.2 } },
    { mascotId: 'fox', itemId: 'cape', path: '/cape', box: { x: 0, y: 0.3, w: 1, h: 0.5 } },
    { mascotId: 'owl', itemId: 'cap', path: '/owl-cap', box: { x: 0, y: 0, w: 1, h: 0.2 } },
  ];
  const outfit = { head: 'cap', back: 'cape', eyes: 'glasses' };
  assert.deepEqual(
    outfitLayers(outfit, layers, 'fox').map((l) => l.itemId),
    ['cape', 'cap'],
  );
  assert.deepEqual(
    outfitLayers(outfit, layers, 'fox', items[1]).map((l) => l.itemId),
    ['cape', 'crown'],
  );
  assert.deepEqual(
    outfitLayers(outfit, layers, 'owl').map((l) => l.layer.path),
    ['/owl-cap'],
  );
  assert.equal(SLOT_ORDER[0], 'outfit');
  assert.equal(SLOT_ORDER[SLOT_ORDER.length - 1], 'companion');
});
