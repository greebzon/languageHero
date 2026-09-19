import { createHash } from 'node:crypto';
import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogSchema,
  courseLessonSchema,
  releaseSchema,
  type Release,
} from '@lingvohero/contracts';

export const defaultContentRoot = fileURLToPath(
  new URL('../../../content/store/', import.meta.url),
);
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as unknown;
export async function readCatalog(root = defaultContentRoot) {
  return catalogSchema.parse(await json(join(root, 'catalog.json')));
}
export async function readLesson(root: string, id: string, version: number) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !Number.isSafeInteger(version) || version < 1)
    throw new Error('Invalid lesson reference');
  const lesson = courseLessonSchema.parse(await json(join(root, 'lessons', id, `${version}.json`)));
  if (lesson.id !== id || lesson.version !== version) throw new Error('Lesson identity mismatch');
  return lesson;
}
async function immutableWrite(path: string, value: unknown) {
  const text = JSON.stringify(value, null, 2) + '\n';
  try {
    const old = await json(path);
    if (JSON.stringify(old) !== JSON.stringify(value))
      throw new Error(`Immutable version already exists: ${path}`);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(text);
  } finally {
    await handle.close();
  }
}
export async function publishRelease(input: unknown, root = defaultContentRoot): Promise<Release> {
  const release = releaseSchema.parse(input);
  await mkdir(root, { recursive: true });
  // Only one local publisher may commit at a time. No HTTP write endpoint exists yet.
  const lock = await open(join(root, '.publish.lock'), 'wx');
  const pending = join(root, '.catalog.pending.json');
  try {
    let revision = 0;
    try {
      revision = (await readCatalog(root)).revision;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (release.catalog.revision <= revision) throw new Error('Catalog revision must increase');
    // Validate ALL media and versions before writing any package or switching the catalog.
    const paths = new Set([
      ...release.lessons.flatMap((l) => l.media.map((a) => a.path)),
      ...release.catalog.courses.flatMap((c) => (c.cover ? [c.cover.path] : [])),
      ...(release.catalog.previews ?? []).map((c) => c.cover.path),
    ]);
    for (const path of paths) {
      const filename = path.split('/').pop()!;
      const bytes = await readFile(join(root, 'media', filename));
      if (createHash('sha256').update(bytes).digest('hex') !== filename.split('.')[0])
        throw new Error(`Media checksum mismatch: ${filename}`);
      if (
        filename.endsWith('.png')
          ? bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
          : bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
      )
        throw new Error(`Invalid media format: ${filename}`);
    }
    for (const lesson of release.lessons) {
      try {
        const existing = await readLesson(root, lesson.id, lesson.version);
        if (JSON.stringify(existing) !== JSON.stringify(lesson))
          throw new Error(`Change requires a new lesson version: ${lesson.id}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    for (const lesson of release.lessons) {
      const directory = join(root, 'lessons', lesson.id);
      await mkdir(directory, { recursive: true });
      await immutableWrite(join(directory, `${lesson.version}.json`), lesson);
    }
    await mkdir(join(root, 'catalogs'), { recursive: true });
    await immutableWrite(
      join(root, 'catalogs', `${release.catalog.revision}.json`),
      release.catalog,
    );
    await readFile(join(root, 'catalogs', `${release.catalog.revision}.json`)).then(
      async (bytes) => {
        const file = await open(pending, 'w');
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
      },
    );
    await rename(pending, join(root, 'catalog.json'));
    return release;
  } finally {
    await lock.close();
    await unlink(join(root, '.publish.lock'));
    await unlink(pending).catch(() => undefined);
  }
}
