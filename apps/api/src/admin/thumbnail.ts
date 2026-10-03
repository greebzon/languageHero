import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { shrinkPng } from './renditions.js';

/**
 * Preview widths the panel asks for: 320 for tiles and lists, 640 for the course card. A
 * generated cover is a 2–3 MB 1536×1024 PNG; its 320 px copy is a few dozen KB.
 */
export const THUMB_WIDTHS = ['320', '640'] as const;

const pending = new Map<string, Promise<Buffer | null>>();

/**
 * A narrower copy of a PNG, cached in `<storageRoot>/thumbs/<sha>-<width>.png`. Null when it
 * would not be smaller (or the file is missing) — the caller then sends the original.
 */
export function thumbnail(
  storageRoot: string,
  sha256: string,
  sourcePath: string,
  width: number,
): Promise<Buffer | null> {
  const dir = join(storageRoot, 'thumbs');
  const path = join(dir, `${sha256}-${width}.png`);
  const running = pending.get(path);
  if (running) return running;
  const job = (async () => {
    const cached = await readFile(path).catch(() => null);
    if (cached) return cached;
    const source = await readFile(sourcePath).catch(() => null);
    if (!source) return null;
    const bytes = await shrinkPng(source, { width, height: width * 4 }).catch(() => null);
    if (!bytes) return null;
    await mkdir(dir, { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, path);
    return bytes;
  })().finally(() => pending.delete(path));
  pending.set(path, job);
  return job;
}
