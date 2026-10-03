import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  attemptSchema,
  emailSchema,
  profileInputSchema,
  syncInputSchema,
  learningStateSchema,
  outfitInputSchema,
  treasuryBuySchema,
  treasuryClaimSchema,
  treasuryQuerySchema,
  type AccountSnapshot,
  type AccountProfile,
  type LearningState,
  type Locale,
  visibleCatalog,
} from '@lingvohero/contracts';
import {
  buyItem,
  claimQuest,
  cleanOutfit,
  courseCards,
  dayKey,
  learn,
  priceFor,
  questProgress,
  reconcileCourseAccess,
  shopItem,
  shopItemsFrom,
  starsFor,
  DEFAULT_SHOP_ITEMS,
  DEFAULT_MASCOT_LEVELS,
  wallClock,
} from '@lingvohero/learning-core';
import seed from '../../../../content/seed.json' with { type: 'json' };
import type { Db, Tx } from '../db/client.js';
import {
  learnerAccounts as users,
  learnerSessions as sessions,
  learnerChallenges as challenges,
  learnerAttempts as attempts,
  learnerRewards as rewards,
  learnerDevices as devices,
  learnerLedger as coinLedger,
  shopItems as shopCatalog,
} from '../db/schema.js';
import { readCatalog, readLesson } from '../content.js';
import type { Mailer } from './mail.js';
import { loadJournal } from './treasury.js';
import { clientKey } from '../net.js';
import { availableMascots, progression } from './progression.js';

export type AccountOptions = {
  db: Db;
  contentRoot: string;
  secret: string;
  mailer: Mailer;
  origins: string[];
  secure: boolean;
  sessionDays: number;
  levelStep: number;
  /* Test hook: the clock behind «сегодня», attempt timestamps and code expiry. */
  clock?: () => Date;
};
const COOKIE = 'lh_learner';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const proofSchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
/* Wrong codes per email per day, over all its challenges: guessing is capped per child, not
   only per request (a new challenge gives no fresh budget). */
const DAILY_CODE_FAILURES = 15;
/* Codes mailed to one address per day (on top of 8 an hour): nobody floods a mailbox. */
const DAILY_CODE_MAILS = 20;
/* The learner's time zone moves «сегодня» for quests; a big jump is allowed once a day
   (travel), small ones (daylight saving) any time. */
const TZ_FREE_SHIFT = 60;
const TZ_CHANGE_INTERVAL = 20 * 3600_000;
/* Every error the learner API answers with: a stable `code` the app translates into the
   child's interface language, and the Russian text older app versions show as is. */
const FAULTS = {
  origin_forbidden: 'Этот адрес приложения не разрешён.',
  sign_in: 'Войди в аккаунт.',
  session_expired: 'Нужно снова подтвердить почту. Результаты сохранены на устройстве.',
  code_invalid: 'Код неверный, истёк или уже использован. Запроси новый код.',
  code_throttled: 'Код уже отправлен. Подожди минуту перед повторным запросом.',
  code_locked: 'Слишком много неверных кодов. Попробуй завтра.',
  mail_failed: 'Не удалось отправить письмо. Попробуй позже.',
  recovery_failed: 'Не удалось восстановить аккаунт. Проверь резервный код.',
  language_unknown: 'Выбери доступный язык.',
  attempt_extra_answers: 'В попытке есть лишние ответы.',
  attempt_bad_sequence: 'Некорректная последовательность ответов.',
  attempt_skip: 'Вопрос нельзя пропустить.',
  profile_required: 'Сначала заполни профиль.',
  lesson_locked: 'Сначала пройди предыдущие уроки.',
  attempt_duplicate: 'Попытка с этим номером уже существует.',
  lesson_unfinished: 'Урок ещё не завершён.',
  session_finished: 'Завершённый урок нужно отправить как результат.',
  quest_unknown: 'Такого квеста нет.',
  quest_claimed: 'Награда уже получена.',
  quest_incomplete: 'Квест ещё не выполнен.',
  mascot_locked: 'Этот друг пока закрыт. Продолжай заниматься и повышай уровень.',
  mascot_unknown: 'Этот друг сейчас недоступен.',
  outfit_invalid: 'Надеть можно только свои вещи, каждую на своё место.',
  item_unknown: 'Такого товара нет.',
  invalid_input: 'Проверь заполненные поля.',
  rate_limited: 'Слишком много запросов. Попробуй позже.',
  conflict: 'Данные уже изменились. Обнови экран и попробуй снова.',
  unavailable: 'Сервис временно недоступен. Попробуй позже.',
  lesson_version_missing: 'Версия урока не найдена.',
} as const;
export type FaultCode = keyof typeof FAULTS;
class Fault extends Error {
  constructor(
    public status: number,
    public code: FaultCode,
  ) {
    super(FAULTS[code]);
  }
}
const faultBody = (code: FaultCode) => ({ code, message: FAULTS[code] });
type User = typeof users.$inferSelect;

export async function accountPlugin(app: FastifyInstance, o: AccountOptions) {
  const { db } = o;
  const now = () => (o.clock ? o.clock() : new Date());
  const treasury = { contentRoot: o.contentRoot, now };
  const digest = (value: string) => createHmac('sha256', o.secret).update(value).digest('hex');
  async function cleanup() {
    await db.delete(challenges).where(lt(challenges.expiresAt, new Date(Date.now() - 86400000)));
    await db.delete(sessions).where(lt(sessions.expiresAt, now()));
  }
  const cleanupTimer = setInterval(
    () => void cleanup().catch(() => app.log.warn('Account cleanup failed')),
    3600000,
  );
  cleanupTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanupTimer);
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => clientKey(req.ip),
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Fault) return reply.code(error.status).send(faultBody(error.code));
    if (error instanceof z.ZodError) return reply.code(400).send(faultBody('invalid_input'));
    if ((error as { statusCode?: number }).statusCode === 429)
      return reply.code(429).send(faultBody('rate_limited'));
    if ((error as { code?: string }).code === '23505')
      return reply.code(409).send(faultBody('conflict'));
    request.log.error(
      {
        err: {
          name: error instanceof Error ? error.name : 'Unknown',
          code: (error as { code?: string }).code,
        },
      },
      'Account operation failed',
    );
    return reply.code(503).send(faultBody('unavailable'));
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && !o.origins.includes(origin)) throw new Fault(403, 'origin_forbidden');
    if (origin)
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin')
        .header('Access-Control-Allow-Credentials', 'true');
    reply
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    // Browser cookie writes require Origin. Native clients use a bearer token, but the Android
    // HTTP stack keeps cookies too, so a cookie without Origin is dropped rather than trusted.
    if (req.method !== 'GET' && req.cookies?.[COOKIE] && !origin && !req.headers.authorization) {
      reply.clearCookie(COOKIE, { path: '/v1/account' });
      delete req.cookies[COOKIE];
    }
  });
  app.options('/*', async (_, reply) => reply.code(204).send());
  async function auth(req: FastifyRequest) {
    const token = req.headers.authorization?.replace(/^Bearer /, '') || req.cookies[COOKIE];
    if (!token) throw new Fault(401, 'sign_in');
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, now())));
    if (!session) throw new Fault(401, 'session_expired');
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) throw new Fault(401, 'sign_in');
    return { user, session };
  }
  async function snapshot(user: User, tx: Db | Tx = db): Promise<AccountSnapshot> {
    const progress = await progression(tx, user.id, o.levelStep);
    return {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar as AccountProfile['avatar'],
        language: user.language,
        languages: user.languages ?? [],
        locale: user.uiLocale ?? null,
        onboarded: !!user.onboarded,
        legacyImported: !!user.legacyImported,
        ...progress,
        outfit: user.outfit ?? {},
      },
      learning: user.learning,
      journal: await loadJournal(tx, user, treasury),
    };
  }
  async function issue(
    user: User,
    req: FastifyRequest,
    reply: FastifyReply,
    deviceName: string,
    recoveryCode?: string,
  ) {
    const token = randomBytes(32).toString('base64url');
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: sha(token),
      deviceName,
      expiresAt: new Date(Date.now() + o.sessionDays * 86400000),
    });
    // Only browsers (they send Origin) get the cookie; native clients keep the bearer token.
    if (req.headers.origin)
      reply.setCookie(COOKIE, token, {
        httpOnly: true,
        secure: o.secure,
        sameSite: 'lax',
        path: '/v1/account',
        maxAge: o.sessionDays * 86400,
      });
    return { ...(await snapshot(user)), ...(req.headers.origin ? {} : { token }), recoveryCode };
  }
  /* Published lesson versions never change: a replay reads and validates each file once. */
  const lessonCache = new Map<string, Promise<Awaited<ReturnType<typeof readLesson>>>>();
  function cachedLesson(id: string, version: number) {
    const key = `${id}@${version}`;
    let hit = lessonCache.get(key);
    if (!hit) {
      if (lessonCache.size >= 500) lessonCache.delete(lessonCache.keys().next().value!);
      hit = readLesson(o.contentRoot, id, version);
      hit.catch(() => lessonCache.delete(key));
      lessonCache.set(key, hit);
    }
    return hit;
  }
  /** The time zone a request may set: small shifts always, a big jump once a day. */
  function tzChange(current: User, next: number | undefined) {
    if (next === undefined || next === current.tzOffset) return { tzOffset: current.tzOffset };
    const small = Math.abs(next - current.tzOffset) <= TZ_FREE_SHIFT;
    const rested =
      !current.tzChangedAt || Date.now() - current.tzChangedAt.getTime() > TZ_CHANGE_INTERVAL;
    return small || rested
      ? { tzOffset: next, tzChangedAt: small ? current.tzChangedAt : now() }
      : { tzOffset: current.tzOffset };
  }
  /* The old address hears about a new one: a stolen backup code or session cannot move the
     account away silently. A failure is logged, never blocks the change. */
  async function notifyEmailChanged(req: FastifyRequest, previous: string, next: string) {
    if (previous === next) return;
    try {
      await o.mailer({ kind: 'email-changed', email: previous, newEmail: next });
    } catch (error) {
      const err = error as { code?: string; responseCode?: number };
      req.log.warn({ code: err.code, responseCode: err.responseCode }, 'Notice mail failed');
    }
  }
  async function consume(proof: z.infer<typeof proofSchema>, purpose: string, userId?: string) {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, proof.challengeId))
        .for('update');
      if (
        !row ||
        row.purpose !== purpose ||
        (userId && row.userId !== userId) ||
        row.consumedAt ||
        row.expiresAt <= now() ||
        row.attempts >= 5
      )
        return null;
      const [{ failures }] = await tx
        .select({ failures: sql<number>`coalesce(sum(${challenges.attempts}), 0)::int` })
        .from(challenges)
        .where(
          and(
            eq(challenges.email, row.email),
            gt(challenges.createdAt, new Date(Date.now() - 86400000)),
          ),
        );
      if (failures >= DAILY_CODE_FAILURES) return 'locked' as const;
      const expected = digest(`${row.id}:${proof.code}`);
      if (!timingSafeEqual(Buffer.from(expected), Buffer.from(row.codeHash))) {
        await tx
          .update(challenges)
          .set({ attempts: row.attempts + 1 })
          .where(eq(challenges.id, row.id));
        return null;
      }
      await tx.update(challenges).set({ consumedAt: now() }).where(eq(challenges.id, row.id));
      return row;
    });
    if (result === 'locked') throw new Fault(429, 'code_locked');
    if (!result) throw new Fault(400, 'code_invalid');
    return result;
  }
  app.post(
    '/auth/code',
    { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } },
    async (req) => {
      const input = z
        .object({
          email: emailSchema.optional(),
          purpose: z.enum(['login', 'reauth', 'change-email', 'recover']).default('login'),
        })
        .parse(req.body);
      const owner = ['reauth', 'change-email'].includes(input.purpose)
        ? (await auth(req)).user
        : null;
      const email = input.purpose === 'reauth' ? owner!.email : emailSchema.parse(input.email);
      const row = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
        const today = await tx
          .select()
          .from(challenges)
          .where(
            and(
              eq(challenges.email, email),
              gt(challenges.createdAt, new Date(Date.now() - 86400000)),
            ),
          );
        const recent = today.filter((c) => c.createdAt.getTime() > Date.now() - 3600000);
        if (
          today.length >= DAILY_CODE_MAILS ||
          recent.length >= 8 ||
          recent.some((c) => c.createdAt.getTime() > Date.now() - 60000)
        )
          throw new Fault(429, 'code_throttled');
        // Only the newest code of a purpose works: an old one cannot be guessed in parallel.
        await tx
          .update(challenges)
          .set({ consumedAt: now() })
          .where(
            and(
              eq(challenges.email, email),
              eq(challenges.purpose, input.purpose),
              isNull(challenges.consumedAt),
            ),
          );
        const code = String(randomInt(100000, 1000000));
        const id = randomUUID();
        await tx.insert(challenges).values({
          id,
          email,
          purpose: input.purpose,
          userId: owner?.id,
          codeHash: digest(`${id}:${code}`),
          expiresAt: new Date(Date.now() + 600000),
        });
        return { id, code };
      });
      try {
        await o.mailer({ email, code: row.code, challengeId: row.id, purpose: input.purpose });
      } catch (error) {
        // The SMTP error text may contain the child's address: log only its codes.
        const err = error as { code?: string; responseCode?: number };
        req.log.error({ code: err.code, responseCode: err.responseCode }, 'Account mail failed');
        await db.delete(challenges).where(eq(challenges.id, row.id));
        throw new Fault(503, 'mail_failed');
      }
      return { challengeId: row.id, expiresIn: 600, retryAfter: 60 };
    },
  );
  app.post(
    '/auth/verify',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const input = proofSchema
        .extend({ deviceName: z.string().trim().min(1).max(80) })
        .parse(req.body);
      const proof = await consume(input, 'login');
      const recoveryCode = randomBytes(24).toString('hex');
      const [created] = await db
        .insert(users)
        .values({ email: proof.email, recoveryHash: digest(recoveryCode) })
        .onConflictDoNothing()
        .returning();
      const [user] = created
        ? [created]
        : await db.select().from(users).where(eq(users.email, proof.email));
      return issue(user, req, reply, input.deviceName, created ? recoveryCode : undefined);
    },
  );
  app.post(
    '/auth/recover',
    { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const input = proofSchema
        .extend({
          recoveryCode: z.string().regex(/^[a-f0-9]{48}$/),
          deviceName: z.string().min(1).max(80),
        })
        .parse(req.body);
      const proof = await consume(input, 'recover');
      const fresh = randomBytes(24).toString('hex');
      const user = await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.recoveryHash, digest(input.recoveryCode)))
          .for('update');
        if (!user) throw new Fault(400, 'recovery_failed');
        const [updated] = await tx
          .update(users)
          .set({ email: proof.email, recoveryHash: digest(fresh), updatedAt: now() })
          .where(eq(users.id, user.id))
          .returning();
        await tx.delete(challenges).where(eq(challenges.email, user.email));
        await tx.delete(sessions).where(eq(sessions.userId, user.id));
        return { updated, previous: user.email };
      });
      await notifyEmailChanged(req, user.previous, user.updated!.email);
      return issue(user.updated!, req, reply, input.deviceName, fresh);
    },
  );
  app.get('/me', async (req) => snapshot((await auth(req)).user));
  app.patch('/me', async (req) => {
    const { user } = await auth(req);
    const input = profileInputSchema.parse(req.body);
    if (input.avatar !== undefined && input.avatar !== user.avatar) {
      const progress = await progression(db, user.id, o.levelStep);
      if (
        !(await availableMascots(db)).some((m) => m.id === input.avatar) &&
        !(
          Object.hasOwn(DEFAULT_MASCOT_LEVELS, input.avatar) &&
          progress.unlockedMascotIds.includes(input.avatar)
        )
      )
        throw new Fault(400, 'mascot_unknown');
      if (!progress.unlockedMascotIds.includes(input.avatar)) throw new Fault(403, 'mascot_locked');
    }
    const catalog = await readCatalog(o.contentRoot);
    const codes = [...(input.language ? [input.language] : []), ...(input.languages ?? [])];
    if (codes.some((code) => !catalog.languages.some((l) => l.code === code)))
      throw new Fault(400, 'language_unknown');
    let languages = [...new Set(input.languages ?? user.languages ?? [])];
    if (input.language && !languages.includes(input.language))
      languages = [...languages, input.language];
    const language =
      input.language ??
      (languages.length === 0 || languages.includes(user.language) ? user.language : languages[0]!);
    const [updated] = await db
      .update(users)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        ...(input.locale !== undefined ? { uiLocale: input.locale } : {}),
        language,
        languages,
        // The welcome screen sends the name and the mascot together: that ends the onboarding.
        onboarded:
          user.onboarded || (input.name !== undefined && input.avatar !== undefined) ? 1 : 0,
        updatedAt: now(),
      })
      .where(eq(users.id, user.id))
      .returning();
    return snapshot(updated);
  });
  app.post('/auth/logout', async (req, reply) => {
    const { session } = await auth(req);
    await db.delete(sessions).where(eq(sessions.id, session.id));
    reply.clearCookie(COOKIE, { path: '/v1/account' });
    return { ok: true };
  });
  app.get('/sessions', async (req) => {
    const { user, session } = await auth(req);
    return (
      await db
        .select({
          id: sessions.id,
          deviceName: sessions.deviceName,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, now())))
    ).map((s) => ({ ...s, current: s.id === session.id }));
  });
  app.post('/sessions/revoke', async (req, reply) => {
    const { user, session } = await auth(req);
    const input = proofSchema.extend({ sessionId: z.string().uuid().optional() }).parse(req.body);
    await consume(input, 'reauth', user.id);
    await db
      .delete(sessions)
      .where(
        input.sessionId
          ? and(eq(sessions.userId, user.id), eq(sessions.id, input.sessionId))
          : eq(sessions.userId, user.id),
      );
    if (!input.sessionId || input.sessionId === session.id)
      reply.clearCookie(COOKIE, { path: '/v1/account' });
    return { ok: true };
  });
  app.post('/recovery-code', async (req) => {
    const { user } = await auth(req);
    await consume(proofSchema.parse(req.body), 'reauth', user.id);
    const code = randomBytes(24).toString('hex');
    await db
      .update(users)
      .set({ recoveryHash: digest(code) })
      .where(eq(users.id, user.id));
    return { recoveryCode: code };
  });
  app.post('/email', async (req, reply) => {
    const { user } = await auth(req);
    const input = z.object({ old: proofSchema, next: proofSchema }).parse(req.body);
    await consume(input.old, 'reauth', user.id);
    const next = await consume(input.next, 'change-email', user.id);
    const updated = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set({ email: next.email, updatedAt: now() })
        .where(eq(users.id, user.id))
        .returning();
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await tx.delete(challenges).where(eq(challenges.email, user.email));
      return u;
    });
    await notifyEmailChanged(req, user.email, updated!.email);
    return issue(updated, req, reply, 'После смены почты');
  });
  app.post('/delete', async (req, reply) => {
    const { user } = await auth(req);
    await consume(proofSchema.parse(req.body), 'reauth', user.id);
    await db.transaction(async (tx) => {
      await tx.delete(challenges).where(eq(challenges.email, user.email));
      await tx.delete(users).where(eq(users.id, user.id));
    });
    reply.clearCookie(COOKIE, { path: '/v1/account' });
    return { ok: true };
  });

  async function applyReward(tx: Tx, userId: string, lessonId: string, source: string) {
    await tx
      .insert(rewards)
      .values({ key: `${userId}:${lessonId}`, userId, lessonId, xp: 100, coins: 30, source })
      .onConflictDoNothing();
  }
  /** The child's star total: every verified completion, repeats included (opens sets). */
  async function starTotal(tx: Tx, userId: string) {
    const [row] = await tx
      .select({ stars: sql<number>`coalesce(sum(${attempts.stars}), 0)::int` })
      .from(attempts)
      .where(eq(attempts.userId, userId));
    return row?.stars ?? 0;
  }
  async function replay(input: z.infer<typeof attemptSchema>, state: LearningState) {
    const lesson = await cachedLesson(input.lessonId, input.version);
    return { lesson, state: replayLesson(input, state, lesson) };
  }
  function replayLesson(
    input: z.infer<typeof attemptSchema>,
    state: LearningState,
    lesson: Awaited<ReturnType<typeof readLesson>>,
  ) {
    let value = learn({ ...state, session: null }, { type: 'start', lesson, attemptId: input.id });
    for (const event of input.events) {
      if (value.session?.finished) throw new Fault(422, 'attempt_extra_answers');
      if (event.type === 'answer') {
        const draft = learn(value, { type: 'draft', answer: event.answer });
        const next = learn(draft, { type: 'answer' });
        if (next === draft) throw new Fault(422, 'attempt_bad_sequence');
        value = next;
      } else {
        const next = learn(value, { type: 'next' });
        if (next === value) throw new Fault(422, 'attempt_skip');
        value = next;
      }
    }
    return value;
  }
  app.post(
    '/sync',
    { bodyLimit: 2 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const { user } = await auth(req);
      if (!user.onboarded) throw new Fault(403, 'profile_required');
      const input = syncInputSchema.parse(req.body);
      const catalog = await readCatalog(o.contentRoot);
      return db.transaction(async (tx) => {
        const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
        if (!current) throw new Fault(401, 'sign_in');
        // Access follows the sets this child sees in the interface language of this device (only
        // an explicit choice via PATCH /me is saved: another device may use its own language).
        const locale: Locale = input.locale ?? current.uiLocale ?? 'ru';
        const visible = visibleCatalog(catalog, locale);
        let state = current.learning;
        let stars = await starTotal(tx, user.id);
        const accepted: string[] = [];
        const rejected: { id: string; code: FaultCode; message: string }[] = [];
        function assertAccessible(lessonId: string, version: number) {
          if (
            state.progress[lessonId] ||
            (state.session?.lesson.id === lessonId && state.session.lesson.version === version)
          )
            return;
          const course = visible.courses.find((c) => c.lessons.some((l) => l.id === lessonId));
          const card =
            course &&
            courseCards(visible, state, course.language, stars).find(
              (c) => c.course.id === course.id,
            );
          const index = course?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
          if (
            !card?.unlocked ||
            !course ||
            course.lessons.slice(0, index).some((l) => !state.progress[l.id])
          )
            throw new Fault(422, 'lesson_locked');
        }
        for (const attempt of input.attempts) {
          const hash = sha(JSON.stringify(attempt));
          const [existing] = await tx.select().from(attempts).where(eq(attempts.id, attempt.id));
          if (existing) {
            if (existing.userId !== user.id || existing.payloadHash !== hash)
              throw new Fault(409, 'attempt_duplicate');
            accepted.push(attempt.id);
            continue;
          }
          try {
            assertAccessible(attempt.lessonId, attempt.version);
            const { state: result, lesson } = await replay(attempt, state);
            if (!result.session?.finished) throw new Fault(422, 'lesson_unfinished');
            // This run's stars, not the lesson's best: a repeat earns them again.
            const runStars = starsFor(result.session.mistakes);
            await tx.insert(attempts).values({
              id: attempt.id,
              userId: user.id,
              lessonId: attempt.lessonId,
              version: attempt.version,
              stars: runStars,
              words: lesson.words.length,
              payloadHash: hash,
              createdAt: now(),
            });
            await applyReward(tx, user.id, attempt.lessonId, 'verified');
            stars += runStars;
            state = reconcileCourseAccess(visible, { ...result, session: state.session }, stars);
            accepted.push(attempt.id);
          } catch (error) {
            if (error instanceof Fault || (error as NodeJS.ErrnoException).code === 'ENOENT')
              rejected.push({
                id: attempt.id,
                ...faultBody(error instanceof Fault ? error.code : 'lesson_version_missing'),
              });
            else throw error;
          }
        }
        const key = `${user.id}:${input.deviceId}`;
        const [device] = await tx.select().from(devices).where(eq(devices.key, key));
        if (!device || input.sequence > device.sequence) {
          let session: LearningState['session'] = null;
          if (input.session && !input.session.finished) {
            const incoming = input.session;
            if (incoming.attemptId && incoming.events) {
              assertAccessible(incoming.lesson.id, incoming.lesson.version);
              const { state: restored } = await replay(
                {
                  id: incoming.attemptId,
                  lessonId: incoming.lesson.id,
                  version: incoming.lesson.version,
                  events: incoming.events,
                },
                state,
              );
              if (restored.session?.finished) throw new Fault(422, 'session_finished');
              const withDraft = learn(restored, { type: 'draft', answer: incoming.draft });
              session = withDraft.session;
            }
          }
          state = { ...state, soundEnabled: input.soundEnabled, session };
          await tx
            .insert(devices)
            .values({ key, userId: user.id, sequence: input.sequence })
            .onConflictDoUpdate({
              target: devices.key,
              set: { sequence: input.sequence, updatedAt: now() },
            });
        }
        const [updated] = await tx
          .update(users)
          .set({
            learning: reconcileCourseAccess(visible, state, stars),
            ...tzChange(current, input.tzOffset),
            updatedAt: now(),
          })
          .where(eq(users.id, user.id))
          .returning();
        return { ...(await snapshot(updated, tx)), accepted, rejected };
      });
    },
  );
  /* The published wardrobe (icons ready) is what the app sells; before the panel has any,
     the bundled defaults apply. Boosters and the chest are always there. */
  async function wardrobeItems(tx: Tx) {
    const published = (await tx.select().from(shopCatalog).where(eq(shopCatalog.published, 1)))
      .filter((i) => i.iconAssetId)
      .map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        slot: i.slot,
        rarity: i.rarity,
        price: i.price,
      }));
    return published.length ? shopItemsFrom(published) : DEFAULT_SHOP_ITEMS;
  }
  /* «Сокровищница»: every read settles trophies and freezes; claims and purchases lock the
     learner row so two devices cannot spend the same coins. */
  async function withLearner<T>(
    req: FastifyRequest,
    tzOffset: number | undefined,
    fn: (tx: Tx, user: User) => Promise<T>,
  ) {
    const { user } = await auth(req);
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
      if (!current) throw new Fault(401, 'sign_in');
      const change = tzChange(current, tzOffset);
      const [locked] =
        change.tzOffset === current.tzOffset
          ? [current]
          : await tx.update(users).set(change).where(eq(users.id, user.id)).returning();
      return fn(tx, locked);
    });
  }
  app.get('/treasury', async (req) => {
    treasuryQuerySchema.parse(req.query);
    // A GET never moves the learner's day (a link must not change state): the saved zone.
    return withLearner(req, undefined, async (tx, user) => ({
      journal: await loadJournal(tx, user, treasury),
    }));
  });
  app.post('/treasury/claim', async (req) => {
    const input = treasuryClaimSchema.parse(req.body);
    return withLearner(req, input.tzOffset, async (tx, user) => {
      const journal = await loadJournal(tx, user, treasury);
      const today = wallClock(now(), user.tzOffset);
      const entry = questProgress(journal, today).find((q) => q.quest.id === input.questId);
      if (!entry) throw new Fault(404, 'quest_unknown');
      if (entry.claimed) throw new Fault(409, 'quest_claimed');
      if (!entry.done) throw new Fault(422, 'quest_incomplete');
      const day = dayKey(today);
      await tx.insert(coinLedger).values({
        userId: user.id,
        key: `quest:${input.questId}:${day}`,
        kind: 'quest',
        ref: input.questId,
        day,
        coins: entry.quest.reward,
        createdAt: now(),
      });
      return { journal: claimQuest(journal, input.questId, today) };
    });
  });
  /* What the mascot wears. Only items the learner owns, each in its own slot, are accepted. */
  app.patch('/outfit', async (req) => {
    const input = outfitInputSchema.parse(req.body);
    return withLearner(req, undefined, async (tx, user) => {
      const wearables = (await wardrobeItems(tx))
        .filter((i) => i.kind === 'wardrobe' && i.slot)
        .map((i) => ({ id: i.id, slot: i.slot! }));
      const journal = await loadJournal(tx, user, treasury);
      const outfit = cleanOutfit(input.outfit, wearables, journal.inventory.items);
      const requested = Object.values(input.outfit).filter(Boolean).length;
      if (Object.keys(outfit).length !== requested) throw new Fault(400, 'outfit_invalid');
      const [updated] = await tx
        .update(users)
        .set({ outfit, updatedAt: now() })
        .where(eq(users.id, user.id))
        .returning();
      return snapshot(updated!, tx);
    });
  });
  app.post('/treasury/buy', async (req) => {
    const input = treasuryBuySchema.parse(req.body);
    return withLearner(req, input.tzOffset, async (tx, user) => {
      const items = await wardrobeItems(tx);
      const item = shopItem(input.itemId, items);
      if (!item) throw new Fault(404, 'item_unknown');
      const journal = await loadJournal(tx, user, treasury);
      const today = wallClock(now(), user.tzOffset);
      const lessonCoins = (
        await tx.select().from(rewards).where(eq(rewards.userId, user.id))
      ).reduce((n, r) => n + r.coins, 0);
      const result = buyItem(journal, item.id, today, lessonCoins, { items });
      if (result.outcome === 'ok')
        await tx.insert(coinLedger).values({
          userId: user.id,
          key: item.kind === 'wardrobe' ? `item:${item.id}` : `${item.kind}:${randomUUID()}`,
          kind: item.kind === 'chest' ? 'chest' : 'purchase',
          ref: item.id,
          day: dayKey(today),
          coins: -priceFor(item, today, items),
          itemId: result.granted?.id ?? (item.kind === 'wardrobe' ? item.id : null),
          createdAt: now(),
        });
      return { journal: result.journal, outcome: result.outcome, granted: result.granted ?? null };
    });
  });
  app.post('/legacy/import', async (req) => {
    const { user } = await auth(req);
    const input = learningStateSchema.shape.progress.parse(req.body);
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
      if (current.legacyImported) return snapshot(current, tx);
      const progress = { ...current.learning.progress };
      // Legacy saves lack answer events: only the five original bundled lessons can be imported.
      for (const lesson of seed.lessons) {
        const old = input[lesson.id];
        if (!old) continue;
        const version = Math.min(old.completedVersion, lesson.version);
        progress[lesson.id] = {
          bestStars: Math.max(old.bestStars, progress[lesson.id]?.bestStars ?? 0),
          completedVersion: version,
        };
        // Progress only: these results were never verified, so they earn no coins or XP.
      }
      const catalog = await readCatalog(o.contentRoot);
      const [updated] = await tx
        .update(users)
        .set({
          legacyImported: 1,
          learning: reconcileCourseAccess(
            catalog,
            { ...current.learning, progress },
            await starTotal(tx, user.id),
          ),
        })
        .where(eq(users.id, user.id))
        .returning();
      return snapshot(updated, tx);
    });
  });
}
