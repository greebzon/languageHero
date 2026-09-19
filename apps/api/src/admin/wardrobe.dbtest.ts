import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  mascots,
  outfitLayers,
  shopItems,
  learnerAccounts,
  learnerRewards,
  learnerMascots,
} from '../db/schema.js';
import { zoneFor } from '../generation/outfit-compose.js';
import { runWorkerUntilIdle } from '../worker/runner.js';
import { createTestContext } from './testing.js';

test('mascots and shop items: creation queues asset jobs, layers appear for every pair, publication feeds /v1/shop', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, storageRoot, headers, provider, generation } = ctx;
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) => app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  const worker = { db, provider, storageRoot, rates: generation.rates, workerId: 'wardrobe-test' };

  const fox = await call('POST', '/mascots', {
    id: 'fox-test',
    name: 'Лисёнок Тест',
    withName: 'Тестом',
    trait: 'Любопытный',
    perk: 'Радуется словам',
    description: 'A small orange fox cub with a blue scarf',
    idempotencyKey: randomUUID(),
  });
  assert.equal(fox.statusCode, 201, fox.body);
  assert.equal(fox.json().mascot.ready, false);
  assert.ok(fox.json().job.id);
  assert.equal(fox.json().job.kind, 'mascot');
  const duplicate = await call('POST', '/mascots', {
    id: 'fox-test',
    name: 'x',
    withName: 'x',
    trait: 'x',
    perk: 'x',
    description: 'x',
    idempotencyKey: randomUUID(),
  });
  assert.equal(duplicate.statusCode, 409);
  await runWorkerUntilIdle(worker);
  const job = await call('GET', `/generations/${fox.json().job.id}`);
  assert.equal(job.json().job.status, 'awaiting-review', job.body);
  assert.deepEqual(
    job.json().tasks.map((task: { stage: string; status: string }) => [task.stage, task.status]),
    [
      ['mascot-base', 'succeeded'],
      ['mascot-portrait', 'succeeded'],
      ['mascot-slots', 'succeeded'],
    ],
  );
  const ready = await call('GET', '/mascots/fox-test');
  assert.equal(ready.json().mascot.ready, true);
  assert.ok(ready.json().mascot.bodyUrl && ready.json().mascot.portraitUrl);
  // Hats need room above the head: the vision box is grown upwards.
  assert.ok(ready.json().mascot.slots.head.y < 0.04);
  assert.equal(ready.json().items.length, 0);

  const crown = await call('POST', '/shop-items', {
    id: 'crown-test',
    name: 'Корона',
    description: 'Королевский блеск',
    slot: 'head',
    rarity: 'legendary',
    price: 800,
    prompt: 'A golden crown with gems',
    idempotencyKey: randomUUID(),
  });
  assert.equal(crown.statusCode, 201, crown.body);
  await runWorkerUntilIdle(worker);
  const crownJob = await call('GET', `/generations/${crown.json().job.id}`);
  assert.deepEqual(
    crownJob
      .json()
      .tasks.map((task: { stage: string; targetId: string }) => [task.stage, task.targetId]),
    [
      ['item-icon', 'icon'],
      ['outfit-layer', 'fox-test'],
    ],
  );
  const layers = await db.select().from(outfitLayers);
  assert.equal(layers.length, 1);
  assert.equal(layers[0]!.mascotId, 'fox-test');
  const detail = await call('GET', '/shop-items/crown-test');
  assert.equal(detail.json().item.ready, true);
  assert.ok(detail.json().mascots[0].layer.url);
  // Headwear paints only the top of the head, down to the eye line.
  assert.deepEqual(detail.json().mascots[0].layer.box, zoneFor(ready.json().mascot.slots, 'head'));

  // A companion floats beside the body: its icon is the layer, no edit is made.
  const star = await call('POST', '/shop-items', {
    id: 'star-test',
    name: 'Звезда',
    description: 'Освещает путь',
    slot: 'companion',
    rarity: 'magic',
    price: 300,
    prompt: 'A smiling golden star',
    idempotencyKey: randomUUID(),
  });
  assert.equal(star.statusCode, 201, star.body);
  const editsBefore = provider.calls.filter((c) => c.stage === 'outfit-layer').length;
  await runWorkerUntilIdle(worker);
  assert.equal(provider.calls.filter((c) => c.stage === 'outfit-layer').length, editsBefore);
  assert.equal((await db.select().from(outfitLayers)).length, 2);

  // A second mascot gets layers for both existing items.
  const owl = await call('POST', '/mascots', {
    id: 'owl-test',
    name: 'Сова',
    withName: 'Совой',
    trait: 'Мудрая',
    perk: 'Слушает',
    description: 'A teal owl with glasses',
    idempotencyKey: randomUUID(),
  });
  assert.equal(owl.statusCode, 201, owl.body);
  await runWorkerUntilIdle(worker);
  assert.equal((await db.select().from(outfitLayers)).length, 4);

  // Nothing is public until published; publishing needs the assets to exist.
  const empty = await app.inject({ method: 'GET', url: '/v1/shop' });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.json().mascots.length, 0);
  const notReady = await call('POST', '/mascots', {
    id: 'draft-test',
    name: 'Черновик',
    withName: 'Черновиком',
    trait: 'x',
    perk: 'x',
    description: 'x',
    idempotencyKey: randomUUID(),
  });
  assert.equal(notReady.statusCode, 201);
  assert.equal((await call('PATCH', '/mascots/draft-test', { published: true })).statusCode, 409);
  assert.equal((await call('PATCH', '/mascots/fox-test', { published: true })).statusCode, 200);
  assert.equal(
    (await call('PATCH', '/shop-items/crown-test', { published: true })).statusCode,
    200,
  );
  assert.equal((await call('PATCH', '/shop-items/star-test', { published: true })).statusCode, 200);
  const shop = await app.inject({ method: 'GET', url: '/v1/shop' });
  assert.equal(shop.statusCode, 200, shop.body);
  assert.equal(shop.headers['access-control-allow-origin'], '*');
  const catalog = shop.json();
  assert.deepEqual(
    catalog.mascots.map((m: { id: string }) => m.id),
    ['fox-test'],
  );
  assert.deepEqual(
    catalog.items.map((i: { id: string; rarity: string }) => [i.id, i.rarity]),
    [
      ['crown-test', 'legendary'],
      ['star-test', 'magic'],
    ],
  );
  assert.equal(catalog.layers.length, 2);
  assert.equal(catalog.mascots[0].unlockLevel, 1);
  const [existing] = await db
    .insert(learnerAccounts)
    .values({ email: 'offline-friend@example.test' })
    .returning();
  // Raising a threshold grants access even to an eligible account which is currently offline.
  assert.equal((await call('PATCH', '/mascots/fox-test', { unlockLevel: 8 })).statusCode, 200);
  assert.ok(
    (await db.select().from(learnerMascots).where(eq(learnerMascots.userId, existing!.id))).some(
      (r) => r.mascotId === 'fox-test',
    ),
  );
  const [newcomer] = await db
    .insert(learnerAccounts)
    .values({ email: 'new-friend@example.test' })
    .returning();
  assert.equal((await call('PATCH', '/mascots/fox-test', { unlockLevel: 9 })).statusCode, 200);
  assert.equal(
    (await db.select().from(learnerMascots).where(eq(learnerMascots.userId, newcomer!.id))).length,
    0,
  );
  assert.equal((await call('PATCH', '/mascots/fox-test', { unlockLevel: 0 })).statusCode, 400);

  const media = await app.inject({ method: 'GET', url: catalog.mascots[0].body });
  assert.equal(media.statusCode, 200);
  assert.equal(media.headers['content-type'], 'image/png');
  assert.equal(
    (await app.inject({ method: 'GET', url: '/v1/shop-media/deadbeef.png' })).statusCode,
    404,
  );

  // Changing the slot invalidates the layers; a layers-only regeneration redraws them.
  await call('PATCH', '/shop-items/crown-test', { slot: 'eyes' });
  assert.equal(
    (await db.select().from(outfitLayers).where(eq(outfitLayers.itemId, 'crown-test'))).length,
    0,
  );
  const redo = await call('POST', '/shop-items/crown-test/generate', {
    scope: 'layers',
    idempotencyKey: randomUUID(),
  });
  assert.equal(redo.statusCode, 202, redo.body);
  assert.equal(redo.json().tasks.length, 2);
  await runWorkerUntilIdle(worker);
  // The draft mascot's own job (queued at creation) also ran now, so it got its layers too.
  const redone = await db.select().from(outfitLayers).where(eq(outfitLayers.itemId, 'crown-test'));
  assert.equal(redone.length, 3);
  assert.deepEqual(
    redone.find((l) => l.mascotId === 'fox-test')!.box,
    ready.json().mascot.slots.eyes,
  );

  // Deleting an unpublished mascot removes its layers; a published one is protected.
  assert.equal((await call('DELETE', '/mascots/fox-test')).statusCode, 409);
  assert.equal((await call('DELETE', '/mascots/owl-test')).statusCode, 204);
  assert.equal((await db.select().from(mascots)).length, 2);
  assert.equal((await db.select().from(outfitLayers)).length, 4);
  assert.equal((await db.select().from(shopItems)).length, 2);
});
