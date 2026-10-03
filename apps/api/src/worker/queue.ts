import { and, asc, count, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { GenerationInput } from '@lingvohero/contracts';
import { audit, type AuditInput } from '../admin/audit.js';
import { AdminError } from '../admin/errors.js';
import type { Db, Tx } from '../db/client.js';
import {
  generationJobs,
  generationTasks,
  type GenerationJobKind,
  type GenerationStage,
  type GenerationUsage,
  type ModelConfig,
} from '../db/schema.js';
import { PROMPT_VERSION } from '../generation/prompts.js';
import { ProviderError } from '../generation/provider.js';
import { env } from '../env.js';

export type JobRow = typeof generationJobs.$inferSelect;
export type TaskRow = typeof generationTasks.$inferSelect;

/** Stage order: a stage may start only when every task of the earlier stages has succeeded.
 *  Course jobs use the first eight; asset jobs (mascots, shop items) the last five. */
export const STAGES: GenerationStage[] = [
  'plan',
  'text',
  'review',
  'media-plan',
  'cover',
  'image',
  'audio',
  'assemble',
  'mascot-base',
  'mascot-portrait',
  'mascot-slots',
  'item-icon',
  'outfit-layer',
  'course-cover',
  'lesson-texts',
  'course-texts',
  'mascot-texts',
  'item-texts',
];
export const stageIndex = (stage: GenerationStage) => STAGES.indexOf(stage);
/** Stages whose tasks may run concurrently (independent provider calls). */
export const PARALLEL_STAGES = new Set<GenerationStage>([
  'text',
  'image',
  'audio',
  'outfit-layer',
  'lesson-texts',
  'mascot-texts',
  'item-texts',
]);
/** What the audit log calls the job's subject. */
export const jobSubject = (
  job: Pick<JobRow, 'kind' | 'courseId' | 'subjectId' | 'id'>,
): Pick<AuditInput, 'entityType' | 'entityId'> => ({
  entityType:
    job.kind === 'texts' && !job.courseId
      ? 'wardrobe'
      : job.kind === 'course' || job.kind === 'cover' || job.kind === 'texts'
        ? 'course'
        : job.kind,
  entityId: job.courseId ?? job.subjectId ?? job.id,
});
export const LEASE_MS = 2 * 60_000;
export const ACTIVE_JOB_STATUSES = ['queued', 'running'] as const;

export const emptyUsage = (): GenerationUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  images: 0,
  ttsChars: 0,
  estimatedUsd: 0,
});

export async function createJob(
  db: Db,
  input: {
    courseId: string;
    input: GenerationInput;
    modelConfig: ModelConfig;
    idempotencyKey: string;
    requestedBy: string | null;
    costLimitUsd: number;
  },
): Promise<{ job: JobRow; created: boolean }> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.generationJobs.findFirst({
      where: eq(generationJobs.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return { job: existing, created: false };
    const active = await tx.query.generationJobs.findFirst({
      where: and(
        eq(generationJobs.courseId, input.courseId),
        inArray(generationJobs.status, [...ACTIVE_JOB_STATUSES]),
      ),
    });
    if (active)
      throw new AdminError(409, 'job_in_progress', 'У этого сета уже идёт генерация', undefined);
    await assertDailyBudget(tx);
    const [job] = await tx
      .insert(generationJobs)
      .values({
        kind: 'course',
        courseId: input.courseId,
        input: input.input,
        modelConfig: input.modelConfig,
        promptVersion: PROMPT_VERSION,
        idempotencyKey: input.idempotencyKey,
        requestedBy: input.requestedBy,
        usage: emptyUsage(),
        costLimitUsd: input.costLimitUsd,
      })
      .returning();
    // Later stages add their own tasks (text per lesson, media per word) once the plan is known.
    await tx.insert(generationTasks).values({ jobId: job!.id, stage: 'plan', targetId: 'plan' });
    await audit(tx, {
      actorId: input.requestedBy,
      entityType: 'course',
      entityId: input.courseId,
      action: 'generation-start',
      payload: { jobId: job!.id, totalExercises: input.input.totalExercises },
    });
    return { job: job!, created: true };
  });
}

/**
 * A mascot or shop-item job: its tasks are known up front (the other side of every
 * outfit pair already exists), so they are inserted at once and run in stage order.
 */
export async function createAssetJob(
  db: Db,
  input: {
    kind: Exclude<GenerationJobKind, 'course'>;
    subjectId: string;
    /* Set for jobs that change a set (its cover): the set then allows one job at a time. */
    courseId?: string;
    /* Extra brief stored in the job input (the cover hint). */
    brief?: Record<string, unknown>;
    tasks: { stage: GenerationStage; targetId: string }[];
    modelConfig: ModelConfig;
    idempotencyKey: string;
    requestedBy: string | null;
    costLimitUsd: number;
  },
): Promise<{ job: JobRow; created: boolean }> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.generationJobs.findFirst({
      where: eq(generationJobs.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return { job: existing, created: false };
    const active = await tx.query.generationJobs.findFirst({
      where: and(
        input.courseId
          ? eq(generationJobs.courseId, input.courseId)
          : and(eq(generationJobs.kind, input.kind), eq(generationJobs.subjectId, input.subjectId)),
        inArray(generationJobs.status, [...ACTIVE_JOB_STATUSES]),
      ),
    });
    if (active) throw new AdminError(409, 'job_in_progress', 'Генерация уже идёт', undefined);
    await assertDailyBudget(tx);
    if (!input.tasks.length)
      throw new AdminError(409, 'nothing_to_generate', 'Нечего генерировать', undefined);
    const [job] = await tx
      .insert(generationJobs)
      .values({
        kind: input.kind,
        courseId: input.courseId ?? null,
        subjectId: input.subjectId,
        // Asset jobs carry no course brief; the column is kept for the shared queue.
        input: {
          kind: input.kind,
          subjectId: input.subjectId,
          ...input.brief,
        } as unknown as GenerationInput,
        modelConfig: input.modelConfig,
        promptVersion: PROMPT_VERSION,
        idempotencyKey: input.idempotencyKey,
        requestedBy: input.requestedBy,
        usage: emptyUsage(),
        costLimitUsd: input.costLimitUsd,
      })
      .returning();
    await addTasks(tx, job!.id, input.tasks);
    await audit(tx, {
      actorId: input.requestedBy,
      ...jobSubject(job!),
      action: 'generation-start',
      payload: { jobId: job!.id, tasks: input.tasks.length },
    });
    return { job: job!, created: true };
  });
}

export async function addTasks(
  tx: Tx | Db,
  jobId: string,
  tasks: { stage: GenerationStage; targetId: string; position?: number; inputHash?: string }[],
) {
  if (!tasks.length) return;
  await tx
    .insert(generationTasks)
    .values(
      tasks.map((t, i) => ({
        jobId,
        stage: t.stage,
        targetId: t.targetId,
        position: t.position ?? i,
        inputHash: t.inputHash ?? null,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Claims one runnable task for this worker. Runnable: `pending` (or `retry-wait` whose time has
 * come) in the lowest unfinished stage of a job that is `queued`/`running`; concurrent claims are
 * serialised by `FOR UPDATE SKIP LOCKED`. The lease is what a crashed worker leaves behind.
 */
export async function claimTask(db: Db, workerId: string): Promise<TaskRow | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const candidates = await tx.execute<{ id: string }>(sql`
      select t.id
      from generation_tasks t
      join generation_jobs j on j.id = t.job_id
      where j.status in ('queued', 'running')
        and (
          t.status = 'pending'
          or (t.status = 'retry-wait' and t.next_attempt_at <= ${now})
        )
        and not exists (
          select 1 from generation_tasks p
          where p.job_id = t.job_id
            and array_position(${sql.raw(`array['${STAGES.join("','")}']`)}::text[], p.stage)
              < array_position(${sql.raw(`array['${STAGES.join("','")}']`)}::text[], t.stage)
            and p.status <> 'succeeded'
        )
      order by j.created_at, t.position
      limit 1
      for update of t skip locked
    `);
    const id = candidates.rows[0]?.id;
    if (!id) return null;
    const [task] = await tx
      .update(generationTasks)
      .set({
        status: 'running',
        attempts: sql`${generationTasks.attempts} + 1`,
        leaseOwner: workerId,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        nextAttemptAt: null,
        updatedAt: now,
      })
      .where(eq(generationTasks.id, id))
      .returning();
    await tx
      .update(generationJobs)
      .set({ status: 'running', startedAt: sql`coalesce(${generationJobs.startedAt}, ${now})` })
      .where(and(eq(generationJobs.id, task!.jobId), eq(generationJobs.status, 'queued')));
    return task!;
  });
}

export async function heartbeat(db: Db, taskId: string, workerId: string) {
  await db
    .update(generationTasks)
    .set({ leaseUntil: new Date(Date.now() + LEASE_MS) })
    .where(and(eq(generationTasks.id, taskId), eq(generationTasks.leaseOwner, workerId)));
}

export async function completeTask(
  db: Db,
  task: TaskRow,
  output: Record<string, unknown> | null,
  requestId: string | null,
) {
  await db
    .update(generationTasks)
    .set({
      status: 'succeeded',
      output,
      providerRequestId: requestId,
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(generationTasks.id, task.id));
  // Course jobs finish in `assemble`; asset jobs are done when their last task is.
  const job = await db.query.generationJobs.findFirst({ where: eq(generationJobs.id, task.jobId) });
  if (!job || job.kind === 'course') return;
  const [open] = await db
    .select({ n: count() })
    .from(generationTasks)
    .where(and(eq(generationTasks.jobId, task.jobId), ne(generationTasks.status, 'succeeded')));
  if (!open?.n)
    await db
      .update(generationJobs)
      .set({ status: 'awaiting-review', finishedAt: new Date() })
      .where(and(eq(generationJobs.id, task.jobId), eq(generationJobs.status, 'running')));
}

export const backoffMs = (attempt: number) => 10_000 * 2 ** Math.max(0, attempt - 1);

/** Retryable errors wait with exponential backoff; the last attempt or a permanent error fails the job. */
export async function failTask(
  db: Db,
  task: TaskRow,
  error: { message: string; kind: 'retryable' | 'permanent'; requestId?: string | null },
) {
  const now = new Date();
  const canRetry = error.kind === 'retryable' && task.attempts < task.maxAttempts;
  await db.transaction(async (tx) => {
    await tx
      .update(generationTasks)
      .set({
        status: canRetry ? 'retry-wait' : 'failed',
        nextAttemptAt: canRetry ? new Date(now.getTime() + backoffMs(task.attempts)) : null,
        lastError: error.message.slice(0, 500),
        providerRequestId: error.requestId ?? task.providerRequestId,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(eq(generationTasks.id, task.id));
    if (canRetry) return;
    await tx
      .update(generationTasks)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(generationTasks.jobId, task.jobId),
          inArray(generationTasks.status, ['pending', 'retry-wait']),
        ),
      );
    await tx
      .update(generationJobs)
      .set({
        status: 'failed',
        error: `${task.stage}${task.targetId === task.stage ? '' : ` (${task.targetId})`}: ${error.message.slice(0, 300)}`,
        finishedAt: now,
      })
      .where(eq(generationJobs.id, task.jobId));
  });
}

/** Tasks whose worker died: the lease expired while `running`. Their attempt still counts. */
export async function recoverLeases(db: Db) {
  const now = new Date();
  const rows = await db
    .update(generationTasks)
    .set({ status: 'pending', leaseOwner: null, leaseUntil: null, updatedAt: now })
    .where(and(eq(generationTasks.status, 'running'), lt(generationTasks.leaseUntil, now)))
    .returning({ id: generationTasks.id });
  return rows.length;
}

export async function cancelJob(db: Db, jobId: string, actorId: string | null) {
  return db.transaction(async (tx) => {
    const job = await tx.query.generationJobs.findFirst({ where: eq(generationJobs.id, jobId) });
    if (!job) throw new AdminError(404, 'not_found', 'Работа не найдена');
    if (!ACTIVE_JOB_STATUSES.includes(job.status as 'queued' | 'running'))
      throw new AdminError(409, 'not_active', `Работа уже в состоянии «${job.status}»`);
    const now = new Date();
    await tx
      .update(generationTasks)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(generationTasks.jobId, jobId),
          inArray(generationTasks.status, ['pending', 'retry-wait']),
        ),
      );
    const [updated] = await tx
      .update(generationJobs)
      .set({ status: 'cancelled', finishedAt: now, error: 'Отменено администратором' })
      .where(eq(generationJobs.id, jobId))
      .returning();
    await audit(tx, {
      actorId,
      ...jobSubject(job),
      action: 'generation-cancel',
      payload: { jobId },
    });
    return updated!;
  });
}

/**
 * Manual retry of a failed/cancelled task. A failure cancels its siblings and the later stages
 * as collateral, so all of those (never the succeeded ones) go back to `pending` with a fresh
 * budget of three attempts, and the job runs again. Successful artifacts are keyed by input hash,
 * so nothing already paid for is redone.
 */
export async function retryTask(db: Db, jobId: string, taskId: string, actorId: string | null) {
  return db.transaction(async (tx) => {
    const task = await tx.query.generationTasks.findFirst({
      where: and(eq(generationTasks.id, taskId), eq(generationTasks.jobId, jobId)),
    });
    if (!task) throw new AdminError(404, 'not_found', 'Шаг не найден');
    if (!['failed', 'cancelled', 'retry-wait'].includes(task.status))
      throw new AdminError(409, 'not_retryable', `Шаг в состоянии «${task.status}»`);
    const now = new Date();
    await tx
      .update(generationTasks)
      .set({
        status: 'pending',
        maxAttempts: sql`${generationTasks.attempts} + 3`,
        nextAttemptAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(generationTasks.jobId, jobId),
          inArray(generationTasks.stage, STAGES.slice(stageIndex(task.stage))),
          inArray(generationTasks.status, ['failed', 'cancelled', 'retry-wait']),
        ),
      );
    const [job] = await tx
      .update(generationJobs)
      .set({ status: 'running', error: null, finishedAt: null })
      .where(eq(generationJobs.id, jobId))
      .returning();
    await audit(tx, {
      actorId,
      ...jobSubject(job!),
      action: 'generation-retry',
      payload: { jobId, taskId, stage: task.stage, targetId: task.targetId },
    });
    return job!;
  });
}

/** Tasks in pipeline order: stage, then position within the stage. */
export async function jobTasks(db: Db, jobId: string) {
  const order = sql.raw(`array['${STAGES.join("','")}']::text[]`);
  return db
    .select()
    .from(generationTasks)
    .where(eq(generationTasks.jobId, jobId))
    .orderBy(
      sql`array_position(${order}, ${generationTasks.stage})`,
      asc(generationTasks.position),
      asc(generationTasks.createdAt),
    );
}

/**
 * Adds a call's cost to its job. Parallel tasks of one job add at the same time, so the row is
 * locked (a read-then-write would lose some of them and let the job exceed its limit).
 */
export async function addUsage(db: Db | Tx, jobId: string, delta: Partial<GenerationUsage>) {
  const usage = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .for('update');
    if (!job) return null;
    const usage: GenerationUsage = {
      inputTokens: job.usage.inputTokens + (delta.inputTokens ?? 0),
      outputTokens: job.usage.outputTokens + (delta.outputTokens ?? 0),
      images: job.usage.images + (delta.images ?? 0),
      ttsChars: job.usage.ttsChars + (delta.ttsChars ?? 0),
      estimatedUsd:
        Math.round((job.usage.estimatedUsd + (delta.estimatedUsd ?? 0)) * 10000) / 10000,
    };
    await tx.update(generationJobs).set({ usage }).where(eq(generationJobs.id, jobId));
    return usage;
  });
  // Checked after the cost is recorded: the call was paid for, the next one is not made.
  if (usage && (await spentToday(db)) > env.GENERATION_DAILY_LIMIT_USD)
    throw new ProviderError(
      `Исчерпан дневной бюджет генерации (${env.GENERATION_DAILY_LIMIT_USD} $)`,
      'permanent',
    );
  return usage;
}

/** Estimated spending of all generation jobs since midnight UTC. */
export async function spentToday(db: Db | Tx) {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({
      usd: sql<number>`coalesce(sum((${generationJobs.usage}->>'estimatedUsd')::numeric), 0)::float`,
    })
    .from(generationJobs)
    // Jobs started today, finished today or still running (a long job across midnight counts).
    .where(
      or(
        gte(generationJobs.createdAt, midnight),
        gte(generationJobs.finishedAt, midnight),
        isNull(generationJobs.finishedAt),
      ),
    );
  return row?.usd ?? 0;
}
async function assertDailyBudget(db: Db | Tx) {
  if ((await spentToday(db)) >= env.GENERATION_DAILY_LIMIT_USD)
    throw new AdminError(
      409,
      'daily_budget',
      `Дневной бюджет генерации (${env.GENERATION_DAILY_LIMIT_USD} $) исчерпан. Попробуйте завтра или увеличьте GENERATION_DAILY_LIMIT_USD.`,
      undefined,
    );
}
