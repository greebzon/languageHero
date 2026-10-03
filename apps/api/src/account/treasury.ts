/* «Сокровищница» on the server: the journal is rebuilt from verified attempts and the coin
   ledger on every read, and anything the rules grant automatically (trophies, streak freezes)
   is written to the ledger right away, so every coin has a row behind it. */
import { asc, eq } from 'drizzle-orm';
import type { Journal, LearningState } from '@lingvohero/contracts';
import {
  TROPHIES,
  awardTrophies,
  buildJournal,
  protectStreak,
  wallClock,
  type LedgerEntry,
} from '@lingvohero/learning-core';
import type { Db, Tx } from '../db/client.js';
import { learnerAttempts as attempts, learnerLedger as ledger } from '../db/schema.js';
import { readLesson } from '../content.js';

export type TreasuryContext = { contentRoot: string; now: () => Date };
type Learner = { id: string; tzOffset: number; learning: LearningState };

const wordCache = new Map<string, Set<string>>();
/* Distinct words across completed lessons (the «Словесный маг» trophy metric). */
export async function countWords(contentRoot: string, state: LearningState): Promise<number> {
  const all = new Set<string>();
  for (const [lessonId, p] of Object.entries(state.progress)) {
    const key = `${lessonId}@${p.completedVersion}`;
    let words = wordCache.get(key);
    if (!words) {
      try {
        const lesson = await readLesson(contentRoot, lessonId, p.completedVersion);
        words = new Set(lesson.words.map((w) => `${lesson.language}:${w.id}`));
      } catch {
        words = new Set();
      }
      wordCache.set(key, words);
    }
    for (const w of words) all.add(w);
  }
  return all.size;
}
export async function loadJournal(
  tx: Db | Tx,
  user: Learner,
  ctx: TreasuryContext,
): Promise<Journal> {
  const rows = await tx
    .select()
    .from(attempts)
    .where(eq(attempts.userId, user.id))
    .orderBy(asc(attempts.createdAt));
  const entries = await tx
    .select()
    .from(ledger)
    .where(eq(ledger.userId, user.id))
    .orderBy(asc(ledger.createdAt));
  const built = buildJournal(
    rows.map((r) => ({
      lessonId: r.lessonId,
      words: r.words,
      perfect: r.stars === 3,
      stars: r.stars,
      at: wallClock(r.createdAt, user.tzOffset),
    })),
    entries.map((e) => ({
      kind: e.kind as LedgerEntry['kind'],
      ref: e.ref,
      day: e.day,
      coins: e.coins,
      itemId: e.itemId,
    })),
  );
  const today = wallClock(ctx.now(), user.tzOffset);
  const settled = awardTrophies(
    protectStreak(built, today),
    today,
    await countWords(ctx.contentRoot, user.learning),
  );
  if (settled === built) return built;
  const inserts: (typeof ledger.$inferInsert)[] = [];
  for (const [id, day] of Object.entries(settled.trophies))
    if (!(id in built.trophies))
      inserts.push({
        userId: user.id,
        key: `trophy:${id}`,
        kind: 'trophy',
        ref: id,
        day,
        coins: TROPHIES.find((t) => t.id === id)?.reward ?? 0,
        createdAt: ctx.now(),
      });
  for (const [day, d] of Object.entries(settled.days))
    if (d.frozen && !built.days[day]?.frozen)
      inserts.push({
        userId: user.id,
        key: `freeze:${day}`,
        kind: 'freeze',
        ref: 'freeze',
        day,
        coins: 0,
        createdAt: ctx.now(),
      });
  if (inserts.length) await tx.insert(ledger).values(inserts).onConflictDoNothing();
  return settled;
}
