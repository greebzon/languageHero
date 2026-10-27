import { z } from 'zod';

/* Building blocks every mechanic shares. They live apart from `course.ts` because the lesson
   schema there is assembled from the mechanics. */
export const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const unique = (values: unknown[]) => new Set(values).size === values.length;
/* Age group of the child, from the age the child gave (see course.ts, `difficultySchema`). */
export const AGE_BANDS = ['6-7', '8-9'] as const;
export const ageBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof ageBandSchema>;
/* Any exercise may be meant for some age groups only (absent: for everyone). A lesson can so
   hold variants of a task per age, each with its own translatable prompt and hint. */
const ageBands = z.array(ageBandSchema).min(1).max(2).optional();
/** Fields of every published exercise. */
export const base = {
  id,
  prompt: z.string().min(1).max(200),
  hint: z.string().min(1).max(300),
  ageBands,
};
/** The same fields in a draft: an admin can save a half-finished exercise. */
export const draftBase = { id, prompt: z.string().max(200), hint: z.string().max(300), ageBands };
/** A reference to a lesson word in a draft (may still point nowhere). */
export const draftRef = z.string().max(80);
/** What a mechanic's checks see of a lesson: its words and the kinds of its media. */
export type LessonRefs = {
  words: ReadonlyMap<string, { spelling: string }>;
  media: ReadonlyMap<string, 'image' | 'audio'>;
};
export type Fail = (message: string) => void;
