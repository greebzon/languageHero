import { createHash } from 'node:crypto';
import type { CourseLesson } from '@lingvohero/contracts';

/** Deterministic JSON: object keys sorted recursively, so equal documents hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    return item;
  });
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * Identity of a lesson's content regardless of its version number. Used by import, plan and
 * publication alike: an unchanged hash keeps the published version, a changed one bumps it.
 */
export function lessonHash(lesson: CourseLesson) {
  const { version: _version, ...rest } = lesson;
  return sha256(canonicalJson(rest));
}
