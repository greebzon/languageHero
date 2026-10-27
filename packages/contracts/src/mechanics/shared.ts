import { z } from 'zod';

/* Building blocks every mechanic shares. They live apart from `course.ts` because the lesson
   schema there is assembled from the mechanics. */
export const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const unique = (values: unknown[]) => new Set(values).size === values.length;
/** Fields of every published exercise. */
export const base = { id, prompt: z.string().min(1).max(200), hint: z.string().min(1).max(300) };
/** The same fields in a draft: an admin can save a half-finished exercise. */
export const draftBase = { id, prompt: z.string().max(200), hint: z.string().max(300) };
/** A reference to a lesson word in a draft (may still point nowhere). */
export const draftRef = z.string().max(80);
/** What a mechanic's checks see of a lesson's words. */
export type LessonWords = ReadonlyMap<string, { spelling: string }>;
export type Fail = (message: string) => void;
