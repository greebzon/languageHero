import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runWorkerUntilIdle } from '../worker/runner.js';
import { createTestContext } from './testing.js';

test('«Перевести тексты» for mascots and items: overlays, outdated after a Russian edit, complete ones in /v1/shop', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const { app, db, storageRoot, headers, provider, generation } = ctx;
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url: `/v1/admin${url}`, headers, payload });
  const worker = { db, provider, storageRoot, rates: generation.rates, workerId: 'texts-test' };
  const mascot = await call('POST', '/mascots', {
    id: 'owl-test',
    name: 'Совёнок Тест',
    withName: 'Тестом',
    trait: 'Мудрый',
    perk: 'Любит книги',
    description: 'A small brown owl',
    idempotencyKey: randomUUID(),
  });
  assert.equal(mascot.statusCode, 201, mascot.body);
  const item = await call('POST', '/shop-items', {
    id: 'cap-test',
    name: 'Кепка',
    description: 'Зелёная кепка',
    slot: 'head',
    rarity: 'common',
    price: 100,
    prompt: 'A green cap',
    idempotencyKey: randomUUID(),
  });
  assert.equal(item.statusCode, 201, item.body);
  await runWorkerUntilIdle(worker);
  for (const url of ['/mascots/owl-test', '/shop-items/cap-test'])
    assert.equal((await call('PATCH', url, { published: true })).statusCode, 200);
  assert.deepEqual((await call('GET', '/mascots/owl-test')).json().mascot.translations, {
    en: 'missing',
    he: 'missing',
  });

  const started = await call('POST', '/wardrobe/texts/generate', { idempotencyKey: randomUUID() });
  assert.equal(started.statusCode, 202, started.body);
  assert.deepEqual(
    started
      .json()
      .tasks.map((task: { stage: string; targetId: string }) => [task.stage, task.targetId]),
    [
      ['mascot-texts', 'owl-test'],
      ['item-texts', 'cap-test'],
    ],
  );
  await runWorkerUntilIdle(worker);
  const owl = (await call('GET', '/mascots/owl-test')).json().mascot;
  assert.deepEqual(owl.translations, { en: 'ok', he: 'ok' });
  assert.equal(owl.texts.he.withName, '[he] Тестом');
  assert.equal(owl.name, 'Совёнок Тест');
  const shop = (await app.inject({ method: 'GET', url: '/v1/shop' })).json();
  assert.deepEqual(shop.mascots.find((m: { id: string }) => m.id === 'owl-test').texts.en, {
    name: '[en] Совёнок Тест',
    withName: '[en] Тестом',
    trait: '[en] Мудрый',
    perk: '[en] Любит книги',
  });
  assert.equal(
    shop.items.find((i: { id: string }) => i.id === 'cap-test').texts.he.name,
    '[he] Кепка',
  );

  // Nothing left to do; a Russian edit makes that one translation outdated and it alone is redone.
  const again = await call('POST', '/wardrobe/texts/generate', { idempotencyKey: randomUUID() });
  assert.equal(again.json().code, 'nothing_to_generate');
  await call('PATCH', '/shop-items/cap-test', { name: 'Кепка скаута' });
  assert.deepEqual((await call('GET', '/shop-items/cap-test')).json().item.translations, {
    en: 'stale',
    he: 'stale',
  });
  const partial = await call('POST', '/wardrobe/texts/generate', { idempotencyKey: randomUUID() });
  assert.deepEqual(
    partial.json().tasks.map((task: { targetId: string }) => task.targetId),
    ['cap-test'],
  );
  await runWorkerUntilIdle(worker);
  // A translation typed by hand counts as up to date; an incomplete one stays out of /v1/shop.
  const typed = await call('PATCH', '/mascots/owl-test', {
    texts: {
      en: { name: 'Owlet Test', withName: 'Test', trait: 'Wise', perk: 'Loves books' },
      he: { name: 'ינשופון', withName: '', trait: '', perk: '' },
    },
  });
  assert.deepEqual(typed.json().mascot.translations, { en: 'ok', he: 'missing' });
  const after = (await app.inject({ method: 'GET', url: '/v1/shop' })).json();
  const texts = after.mascots.find((m: { id: string }) => m.id === 'owl-test').texts;
  assert.equal(texts.en.name, 'Owlet Test');
  assert.equal(texts.he, undefined);
});
