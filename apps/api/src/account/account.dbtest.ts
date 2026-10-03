import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { releaseSchema, type Answer, type CourseLesson } from '@lingvohero/contracts';
import {
  coinBalance,
  dayKey,
  learn,
  newLearningState,
  priceFor,
  shopItem,
  wallClock,
} from '@lingvohero/learning-core';
import seedData from '../../../../content/seed.json' with { type: 'json' };
import { createTestContext } from '../admin/testing.js';
import {
  learnerChallenges,
  learnerRewards,
  learnerAccounts,
  learnerLedger,
  learnerMascots,
} from '../db/schema.js';
import { publishRelease } from '../content.js';
const seed = releaseSchema.parse(seedData);
type Ctx = NonNullable<Awaited<ReturnType<typeof createTestContext>>>;
const call = (
  ctx: Ctx,
  path: string,
  body?: Record<string, unknown>,
  token?: string,
  method = body === undefined ? 'GET' : 'POST',
) =>
  ctx.app.inject({
    method: method as 'POST',
    url: `/v1/account${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
async function proof(ctx: Ctx, email: string, purpose = 'login', token?: string) {
  await ctx.db
    .update(learnerChallenges)
    .set({ createdAt: new Date(Date.now() - 70000) })
    .where(eq(learnerChallenges.email, email));
  const response = await call(ctx, '/auth/code', { email, purpose }, token);
  assert.equal(response.statusCode, 200, response.body);
  const mail = ctx.mails.find((m) => m.challengeId === response.json().challengeId)!;
  assert.ok(mail);
  assert.equal(response.body.includes(mail.code), false);
  return { challengeId: mail.challengeId, code: mail.code };
}
async function login(ctx: Ctx, email: string) {
  const p = await proof(ctx, email);
  const response = await call(ctx, '/auth/verify', { ...p, deviceName: 'Test phone' });
  assert.equal(response.statusCode, 200, response.body);
  const data = response.json();
  assert.ok(data.token);
  if (!data.profile.onboarded) {
    const r = await call(
      ctx,
      '/me',
      { name: 'Лёва', avatar: 'fox', language: 'en' },
      data.token,
      'PATCH',
    );
    assert.equal(r.statusCode, 200, r.body);
  }
  return data;
}
function attempt(lesson: CourseLesson) {
  const id = randomUUID();
  let state = learn(newLearningState(), { type: 'start', lesson, attemptId: id });
  for (const ex of lesson.exercises) {
    let answer: Answer;
    if (ex.type === 'listen-and-select') answer = { choiceId: ex.wordId };
    else if (ex.type === 'match-pairs')
      answer = { pairs: Object.fromEntries(ex.wordIds.map((w) => [w, w])) };
    else {
      const tiles = [...ex.tiles];
      answer = {
        tileIds: Array.from(lesson.words.find((w) => w.id === ex.wordId)!.spelling).map(
          (letter) =>
            tiles.splice(
              tiles.findIndex((t) => t.letter === letter),
              1,
            )[0].id,
        ),
      };
    }
    state = learn(state, { type: 'draft', answer });
    state = learn(state, { type: 'answer' });
    state = learn(state, { type: 'next' });
  }
  return { id, lessonId: lesson.id, version: lesson.version, events: state.session!.events! };
}
test('mandatory auth, one-time email codes, attempt limits, profile and isolated sessions', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  assert.equal((await call(ctx, '/me')).statusCode, 401);
  const p = await proof(ctx, 'alice@example.test');
  for (let n = 0; n < 5; n++)
    assert.equal(
      (await call(ctx, '/auth/verify', { ...p, code: '000000', deviceName: 'test' })).statusCode,
      400,
    );
  assert.equal((await call(ctx, '/auth/verify', { ...p, deviceName: 'test' })).statusCode, 400);
  const alice = await login(ctx, 'alice@example.test');
  const bob = await login(ctx, 'bob@example.test');
  assert.notEqual(alice.profile.id, bob.profile.id);
  assert.ok(alice.recoveryCode);
  assert.equal((await call(ctx, '/me', undefined, alice.token)).json().profile.name, 'Лёва');
  const disallowed = await ctx.app.inject({
    method: 'GET',
    url: '/v1/account/me',
    headers: { origin: 'https://evil.test', authorization: `Bearer ${alice.token}` },
  });
  assert.equal(disallowed.statusCode, 403);
  // Android keeps cookies even for a token client: a stale cookie without Origin is dropped.
  const stale = await ctx.app.inject({
    method: 'POST',
    url: '/v1/account/auth/code',
    headers: { cookie: 'lh_learner=stale' },
    payload: { email: 'stale@example.test' },
  });
  assert.equal(stale.statusCode, 200);
  assert.match(String(stale.headers['set-cookie']), /lh_learner=;/);
  const again = await login(ctx, 'alice@example.test');
  assert.equal(again.recoveryCode, undefined);
  const sessions = await call(ctx, '/sessions', undefined, alice.token);
  assert.equal(sessions.json().length, 2);
  await call(ctx, '/auth/logout', {}, alice.token);
  assert.equal((await call(ctx, '/me', undefined, alice.token)).statusCode, 401);
  assert.equal((await call(ctx, '/me', undefined, again.token)).statusCode, 200);
});
test('server replays answers; retries and versions do not mint duplicate rewards; level and progress restore', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const user = await login(ctx, 'progress@example.test');
  const deviceId = randomUUID();
  const first = attempt(seed.lessons[0]);
  const body = { deviceId, sequence: 1, attempts: [first], session: null, soundEnabled: true };
  const a = await call(ctx, '/sync', body, user.token);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().profile.xp, 100);
  assert.equal(a.json().accepted[0], first.id);
  const duplicate = await call(ctx, '/sync', body, user.token);
  assert.equal(duplicate.json().profile.xp, 100);
  const tampered = await call(
    ctx,
    '/sync',
    { ...body, attempts: [{ ...first, events: [{ type: 'next' }] }] },
    user.token,
  );
  assert.equal(tampered.statusCode, 409);
  const invalid = await call(
    ctx,
    '/sync',
    {
      ...body,
      sequence: 2,
      attempts: [{ ...first, id: randomUUID(), events: [{ type: 'next' }] }],
    },
    user.token,
  );
  assert.equal(invalid.json().rejected.length, 1);
  assert.equal(invalid.json().profile.xp, 100);
  const done = await call(
    ctx,
    '/sync',
    { ...body, sequence: 3, attempts: seed.lessons.slice(1).map(attempt) },
    user.token,
  );
  assert.equal(done.statusCode, 200, done.body);
  assert.equal(done.json().rejected.length, 0);
  assert.equal(done.json().profile.xp, 500);
  assert.equal(done.json().profile.level, 3);
  assert.equal(done.json().profile.coins, 150);
  const replay = await call(
    ctx,
    '/sync',
    { ...body, sequence: 4, attempts: [attempt(seed.lessons[0])] },
    user.token,
  );
  assert.equal(replay.json().profile.xp, 500);
  const otherDevice = await login(ctx, 'progress@example.test');
  assert.equal(otherDevice.profile.xp, 500);
  assert.equal((await ctx.db.select().from(learnerRewards)).length, 5);
});
test('treasury: quests count verified lessons, claims and purchases are recorded once on the server', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const user = await login(ctx, 'treasury@example.test');
  const tz = -new Date().getTimezoneOffset();
  const today = wallClock(new Date(), tz);
  const day = dayKey(today);
  const deviceId = randomUUID();
  const base = { deviceId, session: null, soundEnabled: true, tzOffset: tz };
  const first = await call(
    ctx,
    '/sync',
    { ...base, sequence: 1, attempts: [attempt(seed.lessons[0])] },
    user.token,
  );
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().journal.days[day].lessons, 1);
  assert.equal(first.json().journal.days[day].words, seed.lessons[0].words.length);
  assert.equal(first.json().journal.days[day].perfect, 1);
  const early = await call(ctx, '/treasury/claim', { questId: 'words', tzOffset: tz }, user.token);
  assert.equal(early.statusCode, 422);
  const claim = await call(ctx, '/treasury/claim', { questId: 'lesson', tzOffset: tz }, user.token);
  assert.equal(claim.statusCode, 200, claim.body);
  // Trophies settle on the server clock (an evening run earns «Ночной знаток»), so compare deltas.
  const trophyCoins = claim.json().journal.bonusCoins - 20;
  assert.equal(trophyCoins, first.json().journal.bonusCoins);
  assert.deepEqual(claim.json().journal.claimedQuests[day], ['lesson']);
  const twice = await call(ctx, '/treasury/claim', { questId: 'lesson', tzOffset: tz }, user.token);
  assert.equal(twice.statusCode, 409);
  const poor = await call(ctx, '/treasury/buy', { itemId: 'astronaut', tzOffset: tz }, user.token);
  assert.equal(poor.statusCode, 200, poor.body);
  assert.equal(poor.json().outcome, 'poor');
  assert.equal(
    (
      await call(
        ctx,
        '/sync',
        { ...base, sequence: 2, attempts: seed.lessons.slice(1).map(attempt) },
        user.token,
      )
    ).json().profile.coins,
    150,
  );
  const capPrice = priceFor(shopItem('cap')!, today);
  const bought = await call(ctx, '/treasury/buy', { itemId: 'cap', tzOffset: tz }, user.token);
  assert.equal(bought.statusCode, 200, bought.body);
  assert.equal(bought.json().outcome, 'ok');
  assert.deepEqual(bought.json().journal.inventory.items, ['cap']);
  assert.equal(bought.json().journal.spentCoins, capPrice);
  assert.equal(
    (await call(ctx, '/treasury/buy', { itemId: 'cap', tzOffset: tz }, user.token)).json().outcome,
    'owned',
  );
  const me = await call(ctx, '/me', undefined, user.token);
  const balance = coinBalance(me.json().journal, me.json().profile.coins);
  assert.equal(balance, 150 + 20 + trophyCoins - capPrice);
  const chest = await call(ctx, '/treasury/buy', { itemId: 'chest', tzOffset: tz }, user.token);
  assert.equal(chest.statusCode, 200, chest.body);
  if (balance >= 100) {
    assert.equal(chest.json().outcome, 'ok');
    assert.ok(chest.json().granted && chest.json().granted.id !== 'cap');
    assert.equal(chest.json().journal.inventory.items.length, 2);
  } else assert.equal(chest.json().outcome, 'poor');
  // The outfit accepts owned items in their own slots only and comes back with the profile.
  const worn = await call(ctx, '/outfit', { outfit: { head: 'cap' } }, user.token, 'PATCH');
  assert.equal(worn.statusCode, 200, worn.body);
  assert.deepEqual(worn.json().profile.outfit, { head: 'cap' });
  assert.equal(
    (await call(ctx, '/outfit', { outfit: { head: 'astronaut' } }, user.token, 'PATCH')).statusCode,
    400,
  );
  assert.equal(
    (await call(ctx, '/outfit', { outfit: { eyes: 'cap' } }, user.token, 'PATCH')).statusCode,
    400,
  );
  assert.deepEqual((await call(ctx, '/me', undefined, user.token)).json().profile.outfit, {
    head: 'cap',
  });
  assert.deepEqual(
    (await call(ctx, '/outfit', { outfit: {} }, user.token, 'PATCH')).json().profile.outfit,
    {},
  );
  const treasury = await call(ctx, `/treasury?tzOffset=${tz}`, undefined, user.token);
  assert.equal(treasury.statusCode, 200, treasury.body);
  assert.deepEqual(treasury.json().journal, chest.json().journal);
  assert.equal(
    (await ctx.db.select().from(learnerLedger)).filter((r) => r.kind === 'quest').length,
    1,
  );
});
test('two devices: parallel purchases spend coins once, the outfit follows the account', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const phone = await login(ctx, 'twins@example.test');
  const tablet = await login(ctx, 'twins@example.test');
  assert.notEqual(phone.token, tablet.token);
  const tz = -new Date().getTimezoneOffset();
  const today = wallClock(new Date(), tz);
  const synced = await call(
    ctx,
    '/sync',
    {
      deviceId: randomUUID(),
      session: null,
      soundEnabled: true,
      tzOffset: tz,
      sequence: 1,
      attempts: seed.lessons.map(attempt),
    },
    phone.token,
  );
  assert.equal(synced.statusCode, 200, synced.body);
  const buy = (token: string, itemId: string) =>
    call(ctx, '/treasury/buy', { itemId, tzOffset: tz }, token);

  // The same item from both devices at once: bought once, paid once.
  const pair = await Promise.all([buy(phone.token, 'cap'), buy(tablet.token, 'cap')]);
  assert.deepEqual(pair.map((r) => r.json().outcome).sort(), ['ok', 'owned']);
  const capPrice = priceFor(shopItem('cap')!, today);
  const me = (await call(ctx, '/me', undefined, tablet.token)).json();
  assert.equal(me.journal.spentCoins, capPrice);
  assert.deepEqual(me.journal.inventory.items, ['cap']);

  // More chests than the balance allows, from both devices at once: never below zero.
  const balance = coinBalance(me.journal, me.profile.coins);
  const chestPrice = priceFor(shopItem('chest')!, today);
  const affordable = Math.floor(balance / chestPrice);
  const tries = affordable + 2;
  const chests = await Promise.all(
    Array.from({ length: tries }, (_, i) => buy(i % 2 ? tablet.token : phone.token, 'chest')),
  );
  const outcomes = chests.map((r) => r.json().outcome);
  assert.equal(outcomes.filter((o) => o === 'ok').length, affordable, outcomes.join(','));
  assert.equal(outcomes.filter((o) => o === 'poor').length, tries - affordable);
  const after = (await call(ctx, '/me', undefined, phone.token)).json();
  assert.equal(coinBalance(after.journal, after.profile.coins), balance - affordable * chestPrice);
  const purchases = (await ctx.db.select().from(learnerLedger)).filter(
    (r) => r.kind === 'purchase',
  );
  assert.equal(purchases.length, 1 + affordable);

  // The look saved on one device is what the other one shows.
  const worn = await call(ctx, '/outfit', { outfit: { head: 'cap' } }, phone.token, 'PATCH');
  assert.equal(worn.statusCode, 200, worn.body);
  assert.deepEqual((await call(ctx, '/me', undefined, tablet.token)).json().profile.outfit, {
    head: 'cap',
  });
  await call(ctx, '/outfit', { outfit: {} }, tablet.token, 'PATCH');
  assert.deepEqual((await call(ctx, '/me', undefined, phone.token)).json().profile.outfit, {});
});
test('recovery rotates code and sessions, email change needs both proofs, deletion cascades data', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const user = await login(ctx, 'lost@example.test');
  const recover = await proof(ctx, 'new@example.test', 'recover');
  const response = await call(ctx, '/auth/recover', {
    ...recover,
    recoveryCode: user.recoveryCode,
    deviceName: 'New phone',
  });
  assert.equal(response.statusCode, 200, response.body);
  const restored = response.json();
  assert.equal(restored.profile.id, user.profile.id);
  assert.notEqual(restored.recoveryCode, user.recoveryCode);
  assert.equal((await call(ctx, '/me', undefined, user.token)).statusCode, 401);
  const old = await proof(ctx, 'new@example.test', 'reauth', restored.token);
  const next = await proof(ctx, 'final@example.test', 'change-email', restored.token);
  const changed = await call(ctx, '/email', { old, next }, restored.token);
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().profile.email, 'final@example.test');
  assert.equal((await call(ctx, '/me', undefined, restored.token)).statusCode, 401);
  const token = changed.json().token;
  const confirmation = await proof(ctx, 'final@example.test', 'reauth', token);
  assert.equal((await call(ctx, '/delete', confirmation, token)).statusCode, 200);
  assert.equal((await call(ctx, '/me', undefined, token)).statusCode, 401);
  assert.equal((await ctx.db.select().from(learnerAccounts)).length, 0);
});
test('languages and interface locale: partial profile updates, hidden untranslated sets', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  // A second learning language, and the set without translations (Russian only).
  const release = structuredClone(seed);
  release.catalog.revision += 100;
  release.catalog.languages.push({ code: 'de', title: 'Немецкий', direction: 'ltr' });
  for (const course of release.catalog.courses) {
    delete course.locales;
    for (const ref of course.lessons) {
      ref.version += 100;
      delete ref.titles;
    }
  }
  for (const lesson of release.lessons) {
    lesson.version += 100;
    delete lesson.texts;
  }
  await publishRelease(releaseSchema.parse(release), ctx.contentRoot);
  const p = await proof(ctx, 'polyglot@example.test');
  const fresh = (await call(ctx, '/auth/verify', { ...p, deviceName: 'Test phone' })).json();
  const token = fresh.token as string;
  const patch = (body: Record<string, unknown>) => call(ctx, '/me', body, token, 'PATCH');
  const named = (await patch({ name: 'Мия', avatar: 'fox' })).json();
  assert.equal(named.profile.onboarded, true);
  assert.deepEqual(named.profile.languages, []);
  assert.equal(named.profile.locale, null);
  assert.deepEqual((await patch({ language: 'en' })).json().profile.languages, ['en']);
  const second = (await patch({ language: 'de' })).json().profile;
  assert.deepEqual([second.language, second.languages], ['de', ['en', 'de']]);
  const unknown = await patch({ language: 'xx' });
  assert.equal(unknown.statusCode, 400);
  // A stable code for the app's own wording, the Russian text for older app versions.
  assert.deepEqual(unknown.json(), { code: 'language_unknown', message: 'Выбери доступный язык.' });
  assert.equal((await patch({})).json().code, 'invalid_input');
  assert.equal((await patch({})).statusCode, 400);
  const hebrew = (await patch({ locale: 'he' })).json().profile;
  assert.deepEqual([hebrew.locale, hebrew.name, hebrew.language], ['he', 'Мия', 'de']);
  // An untranslated set is hidden for English: its lessons cannot be played there.
  const lesson = release.lessons[0]!;
  const body = { deviceId: randomUUID(), sequence: 1, session: null, soundEnabled: true };
  const english = await call(
    ctx,
    '/sync',
    { ...body, locale: 'en', attempts: [attempt(lesson)] },
    token,
  );
  assert.equal(english.statusCode, 200, english.body);
  assert.equal(english.json().rejected.length, 1);
  assert.equal(english.json().rejected[0].code, 'lesson_locked');
  assert.equal(english.json().profile.locale, 'he');
  const russian = await call(
    ctx,
    '/sync',
    { ...body, sequence: 2, locale: 'ru', attempts: [attempt(lesson)] },
    token,
  );
  assert.equal(russian.json().accepted.length, 1);
  assert.equal(russian.json().profile.locale, 'he');
});

test('mascots unlock from verified XP, cannot be forged, and stay selected on another device', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const user = await login(ctx, 'friends@example.test');
  assert.deepEqual(user.profile.unlockedMascotIds, ['fox']);
  assert.equal((await call(ctx, '/me', { avatar: 'owl' }, user.token, 'PATCH')).statusCode, 403);
  assert.equal(
    (await call(ctx, '/me', { avatar: 'unknown' }, user.token, 'PATCH')).statusCode,
    400,
  );
  await call(
    ctx,
    '/me',
    { level: 100, xp: 90000, unlockedMascotIds: ['owl'], name: 'Лёва' },
    user.token,
    'PATCH',
  );
  assert.equal((await call(ctx, '/me', { avatar: 'owl' }, user.token, 'PATCH')).statusCode, 403);
  const sync = {
    deviceId: randomUUID(),
    sequence: 1,
    attempts: seed.lessons.slice(0, 3).map(attempt),
    session: null,
    soundEnabled: true,
  };
  const result = await call(ctx, '/sync', sync, user.token);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().profile.level, 3);
  assert.deepEqual(new Set(result.json().profile.unlockedMascotIds), new Set(['fox', 'rabbit']));
  const responses = await Promise.all([
    call(ctx, '/sync', sync, user.token),
    call(ctx, '/me', undefined, user.token),
  ]);
  assert.ok(responses.every((r) => r.statusCode === 200));
  assert.equal(
    (await ctx.db.select().from(learnerMascots).where(eq(learnerMascots.userId, user.profile.id)))
      .length,
    2,
  );
  const changed = await call(ctx, '/me', { avatar: 'rabbit' }, user.token, 'PATCH');
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().profile.xp, 300);
  assert.equal(changed.json().profile.avatar, 'rabbit');
  assert.equal((await login(ctx, 'friends@example.test')).profile.avatar, 'rabbit');
  const other = await login(ctx, 'other-friends@example.test');
  assert.equal(
    (await call(ctx, '/me', { avatar: 'rabbit' }, other.token, 'PATCH')).statusCode,
    403,
  );
});

test('legacy accounts retain selected mascot and their old level after the curve changes', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  const user = await login(ctx, 'legacy-friends@example.test');
  await ctx.db
    .update(learnerAccounts)
    .set({ avatar: 'owl', levelFloor: null })
    .where(eq(learnerAccounts.id, user.profile.id));
  // Same grant as migration 0009 gives every existing account.
  await ctx.db
    .insert(learnerMascots)
    .values({ key: `${user.profile.id}:owl`, userId: user.profile.id, mascotId: 'owl' });
  await ctx.db.insert(learnerRewards).values({
    key: `${user.profile.id}:old`,
    userId: user.profile.id,
    lessonId: 'old',
    source: 'test',
    xp: 3000,
    coins: 0,
  });
  const snapshot = (await call(ctx, '/me', undefined, user.token)).json();
  assert.equal(snapshot.profile.level, 11);
  assert.equal(snapshot.profile.avatar, 'owl');
  assert.ok(snapshot.profile.unlockedMascotIds.includes('owl'));
  assert.equal(snapshot.profile.nextLevelXp, 4500);
  assert.equal((await call(ctx, '/me', undefined, user.token)).json().profile.level, 11);
});
test('security: newest code only, guessing capped per email, tz jumps once a day, legacy import earns nothing', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  // A newer code cancels the older one.
  const first = await proof(ctx, 'guess@example.test');
  const second = await proof(ctx, 'guess@example.test');
  const stale = await call(ctx, '/auth/verify', { ...first, deviceName: 'x' });
  assert.equal(stale.json().code, 'code_invalid');
  // 15 wrong codes a day for one email, whatever the challenge: then even the right one waits.
  for (let round = 0; round < 3; round++) {
    const p = round === 0 ? second : await proof(ctx, 'guess@example.test');
    for (let n = 0; n < 5; n++)
      await call(ctx, '/auth/verify', { ...p, code: '000000', deviceName: 'x' });
  }
  const right = await proof(ctx, 'guess@example.test');
  const locked = await call(ctx, '/auth/verify', { ...right, deviceName: 'x' });
  assert.equal(locked.statusCode, 429);
  assert.equal(locked.json().code, 'code_locked');

  const user = await login(ctx, 'tz@example.test');
  const body = { deviceId: randomUUID(), attempts: [], session: null, soundEnabled: true };
  const tz = async () =>
    (await ctx.db.select().from(learnerAccounts).where(eq(learnerAccounts.id, user.profile.id)))[0]!
      .tzOffset;
  await call(ctx, '/sync', { ...body, sequence: 1, tzOffset: 600 }, user.token);
  assert.equal(await tz(), 600);
  await call(ctx, '/sync', { ...body, sequence: 2, tzOffset: -600 }, user.token);
  assert.equal(await tz(), 600, 'a second big jump the same day is ignored');
  await call(ctx, '/sync', { ...body, sequence: 3, tzOffset: 660 }, user.token);
  assert.equal(await tz(), 660, 'daylight saving shifts pass');
  await call(ctx, `/treasury?tzOffset=-600`, undefined, user.token);
  assert.equal(await tz(), 660, 'a GET never changes the zone');

  const legacy = await call(
    ctx,
    '/legacy/import',
    { [seed.lessons[0]!.id]: { bestStars: 3, completedVersion: 1 } },
    user.token,
  );
  assert.equal(legacy.statusCode, 200, legacy.body);
  assert.ok(legacy.json().learning.progress[seed.lessons[0]!.id]);
  assert.equal(legacy.json().profile.coins, 0);
  assert.equal(legacy.json().profile.xp, 0);
});
test('stars: every completion counts, repeats too, and the total opens a set by its threshold', async (t) => {
  const ctx = await createTestContext(t);
  if (!ctx) return;
  // The forest set is open from the start; a bonus set needs six stars.
  const release = structuredClone(seed);
  release.catalog.revision += 200;
  const forest = release.catalog.courses[0]!;
  forest.unlockStars = 0;
  const bonusLesson = { ...structuredClone(release.lessons[0]!), id: 'bonus-01', version: 1 };
  release.lessons.push(bonusLesson);
  release.catalog.courses.push({
    ...structuredClone(forest),
    id: 'en-bonus',
    unlockStars: 6,
    lessons: [{ ...structuredClone(forest.lessons[0]!), id: 'bonus-01', version: 1 }],
  });
  await publishRelease(releaseSchema.parse(release), ctx.contentRoot);
  const user = await login(ctx, 'stars@example.test');
  const body = { deviceId: randomUUID(), session: null, soundEnabled: true };
  const first = release.lessons[0]!;
  // One perfect run: three stars, not enough for the bonus set.
  const once = await call(
    ctx,
    '/sync',
    { ...body, sequence: 1, attempts: [attempt(first), attempt(bonusLesson)] },
    user.token,
  );
  assert.equal(once.statusCode, 200, once.body);
  assert.equal(once.json().journal.stars, 3);
  assert.equal(once.json().rejected[0].code, 'lesson_locked');
  // The same lesson again earns its stars again: six open the bonus set.
  const again = await call(
    ctx,
    '/sync',
    { ...body, sequence: 2, attempts: [attempt(first), attempt(bonusLesson)] },
    user.token,
  );
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(again.json().rejected.length, 0);
  assert.equal(again.json().journal.stars, 9);
  assert.ok(again.json().learning.unlockedCourseIds.includes('en-bonus'));
  // The repeat paid no second reward: XP counts each lesson once.
  assert.equal(again.json().profile.xp, 200);
});
