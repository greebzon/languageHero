import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  catalogSchema,
  type Catalog,
  type CourseLesson,
  type Release,
} from '@lingvohero/contracts';
import { AdminError } from '../admin/errors.js';
import { shaFromPath } from '../admin/media.js';
import { readCatalog, readLesson } from '../content.js';
import type { Db, Tx } from '../db/client.js';
import {
  adminUsers,
  assetRenditions,
  assets,
  courses,
  languages,
  lessons,
  publications,
} from '../db/schema.js';
import { assetExt } from '../admin/routes/shared.js';
import { DELIVERY, deliveryAssets, largerBox, type Box } from '../admin/renditions.js';
import { audit } from '../admin/audit.js';
import {
  buildRelease,
  type BuildInput,
  type BuildIssue,
  type BuildWarning,
} from './build-release.js';
import type { AssetRef } from './convert.js';
import { canonicalJson, sha256 } from './hash.js';

export type PublicationRow = typeof publications.$inferSelect;
export type CatalogDiff = {
  languages: { added: string[]; removed: string[] };
  courses: { added: string[]; removed: string[]; changed: string[] };
  previews: { added: string[]; removed: string[] };
  lessons: { id: string; title: string; from: number | null; to: number }[];
};

export async function currentRevision(contentRoot: string) {
  try {
    return (await readCatalog(contentRoot)).revision;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export async function readCatalogRevision(contentRoot: string, revision: number) {
  if (revision < 1) return null;
  const text = await readFile(join(contentRoot, 'catalogs', `${revision}.json`), 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    },
  );
  return text ? catalogSchema.parse(JSON.parse(text)) : null;
}

export const lockPresent = (contentRoot: string) =>
  access(join(contentRoot, '.publish.lock')).then(
    () => true,
    () => false,
  );

export async function loadAssetRefMap(db: Db | Tx) {
  const refs = new Map<string, AssetRef>();
  for (const row of await db.select().from(assets))
    refs.set(row.id, { id: row.id, sha256: row.sha256, ext: assetExt(row) });
  return refs;
}

/**
 * The size each picture of the next release is needed in: a cover for published and announced
 * sets, one word picture per atlas cell for lessons of published sets. Drafts are skipped.
 */
export function deliveryBoxes(input: Pick<BuildInput, 'courses' | 'lessons'>) {
  const boxes = new Map<string, Box>();
  const want = (id: string, box: Box) => boxes.set(id, largerBox(boxes.get(id), box));
  const published = new Set<string>();
  for (const course of input.courses) {
    if (course.visibility !== 'published' && course.visibility !== 'preview') continue;
    if (course.visibility === 'published') published.add(course.id);
    if (course.coverAssetId) want(course.coverAssetId, DELIVERY.cover);
  }
  for (const lesson of input.lessons) {
    if (!published.has(lesson.courseId)) continue;
    for (const media of lesson.document.media) {
      if (media.kind !== 'image') continue;
      want(media.assetId, {
        width: DELIVERY.word.width * (media.region?.columns ?? 1),
        height: DELIVERY.word.height * (media.region?.rows ?? 1),
      });
    }
  }
  return boxes;
}

/**
 * The build input a release is made from: pictures point at their smaller delivery copies
 * (`deliveryAssets`), so the app never downloads the multi-megabyte originals.
 */
export async function loadReleaseInput(
  db: Db,
  roots: { contentRoot: string; storageRoot: string },
  revision: number,
): Promise<BuildInput> {
  const input = await loadBuildInput(db, revision);
  const delivered = await deliveryAssets(db, roots, deliveryBoxes(input));
  const assets = new Map(input.assets);
  for (const [id, row] of delivered) assets.set(id, { id, sha256: row.sha256, ext: assetExt(row) });
  return { ...input, assets, storedVersions: await storedLessonVersions(roots.contentRoot) };
}

/** The highest published version of every lesson in the store (`lessons/<id>/<version>.json`). */
export async function storedLessonVersions(contentRoot: string) {
  const versions = new Map<string, number>();
  const ids = await readdir(join(contentRoot, 'lessons')).catch(() => [] as string[]);
  for (const id of ids)
    for (const file of await readdir(join(contentRoot, 'lessons', id)).catch(
      () => [] as string[],
    )) {
      const version = /^(\d+)\.json$/.exec(file)?.[1];
      if (version) versions.set(id, Math.max(versions.get(id) ?? 0, Number(version)));
    }
  return versions;
}

export async function loadBuildInput(db: Db | Tx, revision: number): Promise<BuildInput> {
  return {
    languages: await db.select().from(languages),
    courses: await db.select().from(courses),
    lessons: await db.select().from(lessons),
    assets: await loadAssetRefMap(db),
    revision,
  };
}

export function diffCatalogs(base: Catalog | null, next: Catalog): CatalogDiff {
  const ids = <T extends { id?: string; code?: string }>(items: T[] | undefined) =>
    new Set((items ?? []).map((x) => x.id ?? x.code ?? ''));
  const added = (before: Set<string>, after: Set<string>) =>
    [...after].filter((x) => !before.has(x));
  const baseLanguages = ids(base?.languages);
  const nextLanguages = ids(next.languages);
  const baseCourses = ids(base?.courses);
  const nextCourses = ids(next.courses);
  const basePreviews = ids(base?.previews);
  const nextPreviews = ids(next.previews);
  // Compare what a child would notice; the cover's internal media id is a label, not content.
  const essence = (c: Catalog['courses'][number]) =>
    canonicalJson({
      title: c.title,
      description: c.description,
      cover: c.cover?.path,
      lessons: c.lessons.map((l) => ({ ...l, requiredTypes: [...l.requiredTypes].sort() })),
    });
  const changed = next.courses
    .filter((course) => {
      const old = base?.courses.find((c) => c.id === course.id);
      return old && essence(old) !== essence(course);
    })
    .map((c) => c.id);
  const oldVersions = new Map(
    (base?.courses ?? []).flatMap((c) => c.lessons.map((l) => [l.id, l.version] as const)),
  );
  const changedLessons = next.courses
    .flatMap((c) => c.lessons)
    .filter((l) => oldVersions.get(l.id) !== l.version)
    .map((l) => ({ id: l.id, title: l.title, from: oldVersions.get(l.id) ?? null, to: l.version }));
  return {
    languages: {
      added: added(baseLanguages, nextLanguages),
      removed: added(nextLanguages, baseLanguages),
    },
    courses: {
      added: added(baseCourses, nextCourses),
      removed: added(nextCourses, baseCourses),
      changed,
    },
    previews: {
      added: added(basePreviews, nextPreviews),
      removed: added(nextPreviews, basePreviews),
    },
    lessons: changedLessons,
  };
}

export type PlanResult =
  | { publication: PublicationRow; diff: CatalogDiff; warnings: BuildWarning[]; errors?: undefined }
  | { errors: BuildIssue[]; warnings: BuildWarning[]; publication?: undefined };

/** Builds and stores an immutable snapshot of the next release without touching the store. */
export async function preparePlan(
  db: Db,
  roots: { contentRoot: string; storageRoot: string },
  actorId: string | null,
): Promise<PlanResult> {
  const { contentRoot } = roots;
  await recoverPublications(db, contentRoot);
  const base = await currentRevision(contentRoot);
  const built = buildRelease(await loadReleaseInput(db, roots, base + 1));
  if (!built.release) return { errors: built.errors, warnings: built.warnings };
  const publication = await insertPlan(db, {
    kind: 'release',
    base,
    release: built.release,
    plan: built.plan,
    actorId,
  });
  const diff = diffCatalogs(await readCatalogRevision(contentRoot, base), built.release.catalog);
  return { publication, diff, warnings: built.warnings };
}

/** A new release that re-publishes an older catalog revision; drafts in the DB stay as they are. */
export async function prepareRestorePlan(
  db: Db,
  contentRoot: string,
  revision: number,
  actorId: string | null,
): Promise<PlanResult> {
  await recoverPublications(db, contentRoot);
  const base = await currentRevision(contentRoot);
  const old = await readCatalogRevision(contentRoot, revision);
  if (!old) throw new AdminError(404, 'not_found', `Ревизия ${revision} не найдена`);
  const packages: CourseLesson[] = [];
  for (const course of old.courses)
    for (const ref of course.lessons)
      packages.push(await readLesson(contentRoot, ref.id, ref.version));
  const release: Release = { catalog: { ...old, revision: base + 1 }, lessons: packages };
  const publication = await insertPlan(db, { kind: 'restore', base, release, plan: [], actorId });
  return {
    publication,
    diff: diffCatalogs(await readCatalogRevision(contentRoot, base), release.catalog),
    warnings: [],
  };
}

async function insertPlan(
  db: Db,
  input: {
    kind: 'release' | 'restore';
    base: number;
    release: Release;
    plan: PublicationRow['lessons'];
    actorId: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(publications)
      .values({
        kind: input.kind,
        baseCatalogRevision: input.base,
        targetRevision: input.release.catalog.revision,
        releaseHash: sha256(canonicalJson(input.release)),
        snapshot: input.release,
        lessons: input.plan,
        actorId: input.actorId,
      })
      .returning();
    await audit(tx, {
      actorId: input.actorId,
      entityType: 'publication',
      entityId: row!.id,
      action: `plan-${input.kind}`,
      payload: { base: input.base, target: input.release.catalog.revision },
    });
    return row!;
  });
}

/** Records in the DB what a successfully switched catalog now means for drafts and assets. */
export async function applyPublished(tx: Tx, publication: PublicationRow) {
  const { catalog, lessons: packages } = publication.snapshot;
  const now = new Date();
  for (const item of publication.lessons)
    await tx
      .update(lessons)
      .set({ lastPublishedVersion: item.version, lastPublishedHash: item.hash, updatedAt: now })
      .where(eq(lessons.id, item.lessonId));
  const courseIds = [...catalog.courses, ...(catalog.previews ?? [])].map((c) => c.id);
  if (courseIds.length)
    await tx
      .update(courses)
      .set({ publishedRevision: catalog.revision, updatedAt: now })
      .where(inArray(courses.id, courseIds));
  const codes = catalog.languages.map((l) => l.code);
  if (codes.length)
    await tx
      .update(languages)
      .set({ publishedAt: now, updatedAt: now })
      .where(and(inArray(languages.code, codes)));
  const shas = [
    ...new Set([
      ...packages.flatMap((l) => l.media.map((m) => shaFromPath(m.path))),
      ...catalog.courses.flatMap((c) => (c.cover ? [shaFromPath(c.cover.path)] : [])),
      ...(catalog.previews ?? []).map((c) => shaFromPath(c.cover.path)),
    ]),
  ];
  if (shas.length) {
    await tx
      .update(assets)
      .set({ status: 'published', storageKey: 'store', updatedAt: now })
      .where(inArray(assets.sha256, shas));
    // The app got smaller copies; the originals they came from count as published in the
    // panel too, but their bytes stay in the draft storage.
    const delivered = tx
      .select({ id: assetRenditions.sourceAssetId })
      .from(assetRenditions)
      .innerJoin(assets, eq(assets.id, assetRenditions.assetId))
      .where(inArray(assets.sha256, shas));
    await tx
      .update(assets)
      .set({ status: 'published', updatedAt: now })
      .where(inArray(assets.id, delivered));
  }
  await tx
    .update(publications)
    .set({ status: 'published', finishedAt: now, error: null })
    .where(eq(publications.id, publication.id));
}

/**
 * A crash between the catalog switch and the DB commit leaves a `publishing` row behind. The
 * store is the source of truth: if its revision is the plan's target, finish the bookkeeping;
 * otherwise mark the attempt as interrupted. Never publishes a second time.
 */
export async function recoverPublications(db: Db, contentRoot: string, olderThanMs = 10 * 60_000) {
  const stuck = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.status, 'publishing'),
        lt(publications.createdAt, new Date(Date.now() - olderThanMs)),
      ),
    );
  if (!stuck.length) return;
  const revision = await currentRevision(contentRoot);
  for (const row of stuck)
    await db.transaction(async (tx) => {
      if (revision >= row.targetRevision) await applyPublished(tx, row);
      else
        await tx
          .update(publications)
          .set({ status: 'failed', error: 'interrupted', finishedAt: new Date() })
          .where(eq(publications.id, row.id));
      await audit(tx, {
        actorId: null,
        entityType: 'publication',
        entityId: row.id,
        action: revision >= row.targetRevision ? 'recover-published' : 'recover-failed',
      });
    });
}

export async function listPublications(db: Db, limit: number, offset: number) {
  const rows = await db
    .select({ publication: publications, actorLogin: adminUsers.login })
    .from(publications)
    .leftJoin(adminUsers, eq(adminUsers.id, publications.actorId))
    .orderBy(desc(publications.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map(({ publication, actorLogin }) => publicationDto(publication, actorLogin));
}

export function publicationDto(row: PublicationRow, actorLogin: string | null = null) {
  const { catalog, lessons: packages } = row.snapshot;
  return {
    id: row.id,
    kind: row.kind,
    baseCatalogRevision: row.baseCatalogRevision,
    targetRevision: row.targetRevision,
    releaseHash: row.releaseHash,
    status: row.status,
    actorId: row.actorId,
    actorLogin,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    summary: {
      languages: catalog.languages.length,
      courses: catalog.courses.length,
      previews: catalog.previews?.length ?? 0,
      lessons: packages.length,
    },
  };
}
export type PublicationDto = ReturnType<typeof publicationDto>;
