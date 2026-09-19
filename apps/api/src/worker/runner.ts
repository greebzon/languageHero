import { eq } from 'drizzle-orm';
import { generationTasks } from '../db/schema.js';
import { classifyError } from '../generation/provider.js';
import {
  claimTask,
  completeTask,
  failTask,
  heartbeat,
  PARALLEL_STAGES,
  recoverLeases,
  type TaskRow,
} from './queue.js';
import { runStage, type StageContext } from './stages.js';

const HEARTBEAT_MS = 30_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one claimed task to completion, keeping its lease alive meanwhile. */
export async function runTask(ctx: StageContext, task: TaskRow) {
  const timer = setInterval(() => void heartbeat(ctx.db, task.id, ctx.workerId), HEARTBEAT_MS);
  try {
    const result = await runStage(ctx, task);
    if (result.requeue)
      await ctx.db
        .update(generationTasks)
        .set({ status: 'pending', leaseOwner: null, leaseUntil: null, updatedAt: new Date() })
        .where(eq(generationTasks.id, task.id));
    else await completeTask(ctx.db, task, result.output, result.requestId);
  } catch (error) {
    const classified = classifyError(error);
    await failTask(ctx.db, task, {
      message: classified.message,
      kind: classified.kind,
      requestId: classified.requestId,
    });
  } finally {
    clearInterval(timer);
  }
}

export type LoopOptions = {
  concurrency: number;
  pollMs?: number;
  signal?: AbortSignal;
  /** Return as soon as nothing is claimable and nothing is in flight (tests). */
  untilIdle?: boolean;
  log?: (message: string) => void;
};

/**
 * The worker loop: claim → run, with up to `concurrency` media/text tasks in flight. Sequential
 * stages naturally run alone because a stage cannot start until the previous one finished.
 */
export async function runWorkerLoop(ctx: StageContext, options: LoopOptions) {
  const inflight = new Set<Promise<void>>();
  const pollMs = options.pollMs ?? 1000;
  let lastRecovery = 0;
  while (!options.signal?.aborted) {
    if (Date.now() - lastRecovery > 15_000) {
      const recovered = await recoverLeases(ctx.db);
      if (recovered) options.log?.(`recovered ${recovered} expired lease(s)`);
      lastRecovery = Date.now();
    }
    let claimed: TaskRow | null = null;
    if (inflight.size < options.concurrency) claimed = await claimTask(ctx.db, ctx.workerId);
    if (claimed) {
      options.log?.(`run ${claimed.stage}/${claimed.targetId} (attempt ${claimed.attempts})`);
      const task = claimed;
      const promise = runTask(ctx, task).finally(() => inflight.delete(promise));
      inflight.add(promise);
      // Sequential stages hold the slot until done; parallel ones let the loop claim more.
      if (!PARALLEL_STAGES.has(task.stage)) await promise;
      continue;
    }
    if (inflight.size) {
      await Promise.race(inflight);
      continue;
    }
    if (options.untilIdle) return;
    await sleep(pollMs);
  }
  await Promise.allSettled(inflight);
}

export const runWorkerUntilIdle = (ctx: StageContext, concurrency = 3) =>
  runWorkerLoop(ctx, { concurrency, untilIdle: true });

/** Claims and runs a single task; returns it, or null when nothing was runnable. */
export async function runWorkerOnce(ctx: StageContext) {
  const task = await claimTask(ctx.db, ctx.workerId);
  if (task) await runTask(ctx, task);
  return task;
}
