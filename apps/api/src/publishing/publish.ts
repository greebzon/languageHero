import { access, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { AdminError } from '../admin/errors.js';
import { audit } from '../admin/audit.js';
import { extFromPath, mediaFilename, shaFromPath } from '../admin/media.js';
import { publishRelease } from '../content.js';
import type { Db } from '../db/client.js';
import { assets, publications } from '../db/schema.js';
import { applyPublished, currentRevision, type PublicationRow } from './plan.js';

export type PublishOptions = { contentRoot: string; storageRoot: string };

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Publishes a prepared snapshot: verifies the store has not moved since the plan, copies draft
 * media into the public store, hands the release to `publishRelease` (which validates again and
 * switches the catalog last) and records the outcome. The store never sees a partial release.
 */
export async function publishPlan(
  db: Db,
  options: PublishOptions,
  publicationId: string,
  actorId: string | null,
): Promise<PublicationRow> {
  const row = await db.query.publications.findFirst({ where: eq(publications.id, publicationId) });
  if (!row) throw new AdminError(404, 'not_found', 'План выпуска не найден');
  if (row.status !== 'prepared')
    throw new AdminError(409, 'not_prepared', `План уже в состоянии «${row.status}»`);
  const busy = await db.query.publications.findFirst({
    where: eq(publications.status, 'publishing'),
  });
  if (busy) throw new AdminError(409, 'publication_in_progress', 'Другая публикация ещё идёт');
  const revision = await currentRevision(options.contentRoot);
  if (revision !== row.baseCatalogRevision) {
    await db
      .update(publications)
      .set({ status: 'failed', error: 'stale_plan', finishedAt: new Date() })
      .where(eq(publications.id, row.id));
    throw new AdminError(
      409,
      'stale_plan',
      `Каталог уже на ревизии ${revision}, план строился от ${row.baseCatalogRevision}. Подготовьте выпуск заново`,
    );
  }
  const [claimed] = await db
    .update(publications)
    .set({ status: 'publishing' })
    .where(and(eq(publications.id, row.id), eq(publications.status, 'prepared')))
    .returning();
  if (!claimed) throw new AdminError(409, 'not_prepared', 'План уже используется');

  try {
    await copyDraftMedia(db, options, claimed);
    await publishRelease(claimed.snapshot, options.contentRoot);
  } catch (error) {
    const message = describe(error);
    await db
      .update(publications)
      .set({ status: 'failed', error: message, finishedAt: new Date() })
      .where(eq(publications.id, claimed.id));
    if (error instanceof AdminError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new AdminError(
        409,
        'publisher_busy',
        'Другой процесс публикует каталог (есть .publish.lock). Повторите позже',
      );
    throw new AdminError(422, 'publish_failed', message);
  }
  return db.transaction(async (tx) => {
    await applyPublished(tx, claimed);
    await audit(tx, {
      actorId,
      entityType: 'publication',
      entityId: claimed.id,
      action: 'publish',
      payload: { revision: claimed.targetRevision, kind: claimed.kind },
    });
    return (await tx.query.publications.findFirst({ where: eq(publications.id, claimed.id) }))!;
  });
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 500) : String(error);

/** Media is content-addressed, so copying is idempotent; files already in the store are kept. */
async function copyDraftMedia(db: Db, options: PublishOptions, publication: PublicationRow) {
  const { catalog, lessons } = publication.snapshot;
  const paths = new Set([
    ...lessons.flatMap((l) => l.media.map((m) => m.path)),
    ...catalog.courses.flatMap((c) => (c.cover ? [c.cover.path] : [])),
    ...(catalog.previews ?? []).map((c) => c.cover.path),
  ]);
  await mkdir(join(options.contentRoot, 'media'), { recursive: true });
  for (const path of paths) {
    const name = mediaFilename(shaFromPath(path), extFromPath(path));
    const target = join(options.contentRoot, 'media', name);
    if (await exists(target)) continue;
    const asset = await db.query.assets.findFirst({ where: eq(assets.sha256, shaFromPath(path)) });
    const source = join(options.storageRoot, name);
    if (!asset || !(await exists(source)))
      throw new AdminError(422, 'missing_media', `Файл ${name} не найден в хранилище черновиков`);
    await copyFile(source, target);
  }
}
