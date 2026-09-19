import { eq, sql } from 'drizzle-orm';
import { accountLevel, DEFAULT_MASCOT_LEVELS, levelStartXp } from '@lingvohero/learning-core';
import type { Db, Tx } from '../db/client.js';
import { learnerAccounts, learnerMascots, learnerRewards, mascots } from '../db/schema.js';

/** Match the public catalog, with Tim always available even when only custom mascots exist. */
export async function availableMascots(db: Db | Tx) {
  const published = (await db.select().from(mascots).where(eq(mascots.published, 1))).filter(
    (m) => m.bodyAssetId && m.portraitAssetId && m.slots,
  );
  const list = published.length
    ? published.map((m) => ({ id: m.id, unlockLevel: m.unlockLevel }))
    : Object.entries(DEFAULT_MASCOT_LEVELS).map(([id, unlockLevel]) => ({ id, unlockLevel }));
  return [{ id: 'fox', unlockLevel: 1 }, ...list.filter((m) => m.id !== 'fox')];
}

export async function progression(db: Db | Tx, userId: string, legacyStep: number) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(learnerAccounts)
      .where(eq(learnerAccounts.id, userId))
      .for('update');
    const ledger = await tx.select().from(learnerRewards).where(eq(learnerRewards.userId, userId));
    const xp = ledger.reduce((sum, r) => sum + r.xp, 0);
    const progress = accountLevel(xp, user.levelFloor ?? Math.floor(xp / legacyStep) + 1);
    await tx
      .update(learnerAccounts)
      .set({ levelFloor: progress.level })
      .where(eq(learnerAccounts.id, userId));
    const available = await availableMascots(tx);
    const ids = available.filter((m) => m.unlockLevel <= progress.level).map((m) => m.id);
    if (ids.length)
      await tx
        .insert(learnerMascots)
        .values(
          ids.map((mascotId) => ({
            key: `${userId}:${mascotId}`,
            userId,
            mascotId,
          })),
        )
        .onConflictDoNothing();
    const unlocked = await tx
      .select()
      .from(learnerMascots)
      .where(eq(learnerMascots.userId, userId));
    return {
      ...progress,
      xp,
      coins: ledger.reduce((sum, r) => sum + r.coins, 0),
      unlockedMascotIds: unlocked.map((r) => r.mascotId),
    };
  });
}

/** Freeze earned access before raising a threshold, including accounts currently offline. */
export async function preserveMascotAccess(
  db: Db | Tx,
  id: string,
  level: number,
  legacyStep: number,
) {
  await db.execute(sql`
    insert into learner_mascots (key, user_id, mascot_id)
    select u.id::text || ':' || ${id}, u.id, ${id}
    from learner_accounts u
    left join (select user_id, sum(xp) as xp from learner_rewards group by user_id) r on r.user_id = u.id
    where coalesce(r.xp, 0) >= ${levelStartXp(level)}
       or coalesce(u.level_floor, floor(coalesce(r.xp, 0) / ${legacyStep}) + 1) >= ${level}
    on conflict do nothing
  `);
}
