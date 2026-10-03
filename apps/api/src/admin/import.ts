import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Catalog, CourseLesson } from '@lingvohero/contracts';
import { readCatalog, readLesson } from '../content.js';
import type { Db, Tx } from '../db/client.js';
import { assets, courses, languages, lessons } from '../db/schema.js';
import { lessonHash } from '../publishing/hash.js';
import { baseTextsHash, toLessonDocument } from '../publishing/convert.js';
import { audit } from './audit.js';
import { inspectMedia, shaFromPath } from './media.js';

export type ImportReport = {
  revision: number;
  created: { languages: number; courses: number; lessons: number; assets: number };
  skipped: { languages: number; courses: number; lessons: number; assets: number };
};

/**
 * Seeds the editorial database from the currently published store (catalog + referenced
 * packages + media). Idempotent: rows that already exist are left untouched, so it is safe to
 * run again after a manual CLI publication.
 */
export async function importPublishedContent(
  db: Db,
  contentRoot: string,
  actorId: string | null = null,
): Promise<ImportReport> {
  const catalog = await readCatalog(contentRoot);
  const packages: CourseLesson[] = [];
  for (const course of catalog.courses)
    for (const ref of course.lessons)
      packages.push(await readLesson(contentRoot, ref.id, ref.version));
  const mediaPaths = new Set<string>([
    ...packages.flatMap((l) => l.media.map((m) => m.path)),
    ...catalog.courses.flatMap((c) => (c.cover ? [c.cover.path] : [])),
    ...(catalog.previews ?? []).map((c) => c.cover.path),
  ]);
  const report: ImportReport = {
    revision: catalog.revision,
    created: { languages: 0, courses: 0, lessons: 0, assets: 0 },
    skipped: { languages: 0, courses: 0, lessons: 0, assets: 0 },
  };
  await db.transaction(async (tx) => {
    const assetIdBySha = await importAssets(tx, contentRoot, mediaPaths, report);
    await importLanguages(tx, catalog, report);
    await importCourses(tx, catalog, assetIdBySha, report);
    await importLessons(tx, catalog, packages, assetIdBySha, report);
    await audit(tx, {
      actorId,
      entityType: 'catalog',
      entityId: String(catalog.revision),
      action: 'import',
      payload: { created: report.created, skipped: report.skipped },
    });
  });
  return report;
}

async function importAssets(tx: Tx, contentRoot: string, paths: Set<string>, report: ImportReport) {
  const byShas = new Map<string, string>();
  for (const path of paths) {
    const sha = shaFromPath(path);
    const existing = await tx.query.assets.findFirst({ where: eq(assets.sha256, sha) });
    if (existing) {
      byShas.set(sha, existing.id);
      report.skipped.assets += 1;
      continue;
    }
    const bytes = await readFile(join(contentRoot, 'media', path.split('/').pop()!));
    const info = inspectMedia(bytes);
    if (info.sha256 !== sha) throw new Error(`Media checksum mismatch: ${path}`);
    const [row] = await tx
      .insert(assets)
      .values({
        sha256: sha,
        kind: info.kind,
        mime: info.mime,
        byteSize: info.byteSize,
        width: info.width,
        height: info.height,
        durationMs: info.durationMs,
        storageKey: 'store',
        status: 'published',
        provenance: { source: 'import' },
      })
      .returning({ id: assets.id });
    byShas.set(sha, row!.id);
    report.created.assets += 1;
  }
  return byShas;
}

async function importLanguages(tx: Tx, catalog: Catalog, report: ImportReport) {
  for (const [position, language] of catalog.languages.entries()) {
    const existing = await tx.query.languages.findFirst({
      where: eq(languages.code, language.code),
    });
    if (existing) {
      report.skipped.languages += 1;
      continue;
    }
    await tx.insert(languages).values({
      code: language.code,
      title: language.title,
      direction: language.direction,
      titles: language.titles ?? {},
      status: 'active',
      position,
      publishedAt: new Date(),
    });
    report.created.languages += 1;
  }
}

async function importCourses(
  tx: Tx,
  catalog: Catalog,
  assetIdBySha: Map<string, string>,
  report: ImportReport,
) {
  const positions = new Map<string, number>();
  const nextPosition = (language: string) => {
    const value = positions.get(language) ?? 0;
    positions.set(language, value + 1);
    return value;
  };
  const entries = [
    ...catalog.courses.map((c) => ({ ...c, visibility: 'published' as const })),
    ...(catalog.previews ?? []).map((c) => ({ ...c, visibility: 'preview' as const })),
  ];
  for (const course of entries) {
    const position = nextPosition(course.language);
    const existing = await tx.query.courses.findFirst({ where: eq(courses.id, course.id) });
    if (existing) {
      report.skipped.courses += 1;
      continue;
    }
    await tx.insert(courses).values({
      id: course.id,
      languageCode: course.language,
      title: course.title,
      description: course.description ?? null,
      texts: 'texts' in course ? (course.texts ?? {}) : {},
      coverAssetId: course.cover
        ? (assetIdBySha.get(shaFromPath(course.cover.path)) ?? null)
        : null,
      unlockStars: 'unlockStars' in course ? (course.unlockStars ?? null) : null,
      position,
      visibility: course.visibility,
      publishedRevision: catalog.revision,
    });
    report.created.courses += 1;
  }
}

async function importLessons(
  tx: Tx,
  catalog: Catalog,
  packages: CourseLesson[],
  assetIdBySha: Map<string, string>,
  report: ImportReport,
) {
  for (const course of catalog.courses)
    for (const [position, ref] of course.lessons.entries()) {
      const existing = await tx.query.lessons.findFirst({ where: eq(lessons.id, ref.id) });
      if (existing) {
        report.skipped.lessons += 1;
        continue;
      }
      const lesson = packages.find((l) => l.id === ref.id && l.version === ref.version)!;
      const document = toLessonDocument(lesson, assetIdBySha);
      // Published translations were made from the published Russian: fingerprint them so.
      const sourceHash = baseTextsHash(lesson.title, lesson.presentation ?? null, document);
      await tx.insert(lessons).values({
        id: lesson.id,
        courseId: course.id,
        position,
        title: lesson.title,
        presentation: lesson.presentation ?? null,
        texts: Object.fromEntries(
          Object.entries(lesson.texts ?? {}).map(([l, t]) => [l, { ...t, sourceHash }]),
        ),
        document,
        lastPublishedVersion: lesson.version,
        lastPublishedHash: lessonHash(lesson),
      });
      report.created.lessons += 1;
    }
}
