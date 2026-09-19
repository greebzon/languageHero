import { z } from 'zod';
import { learningStateSchema, answerSchema, localeSchema, type Locale } from './course';
import type { Outfit } from './shop';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
/* A mascot id from the shop catalog (the app bundles fox/bear/rabbit/owl as fallback). */
export const avatarSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const languageCodeSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
/* `PATCH /me`: any subset. The welcome screen sends name + avatar (that completes the
   onboarding); the language picker sends `language` (the current one, added to `languages`
   when new); the profile sends `locale` (the interface language). */
export const profileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    avatar: avatarSchema.optional(),
    language: languageCodeSchema.optional(),
    languages: z.array(languageCodeSchema).min(1).max(10).optional(),
    locale: localeSchema.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'Пустой запрос.' });
/* The profile as the app caches it; `languages`/`locale` are absent in caches from older
   app versions. */
export const profileSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: avatarSchema,
  language: languageCodeSchema,
  languages: z.array(languageCodeSchema).default([]),
  locale: localeSchema.nullable().default(null),
  onboarded: z.boolean(),
});
export const attemptSchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().regex(/^[a-z0-9-]{1,80}$/),
  version: z.number().int().positive(),
  events: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('answer'), answer: answerSchema }),
        z.object({ type: z.literal('next') }),
      ]),
    )
    .max(2000),
});
/* Minutes east of UTC of the learner's device, so «сегодня» follows the child's clock. */
export const tzOffsetSchema = z.number().int().min(-840).max(840);
export const syncInputSchema = z.object({
  deviceId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  attempts: z.array(attemptSchema).max(30),
  session: learningStateSchema.shape.session,
  soundEnabled: z.boolean(),
  tzOffset: tzOffsetSchema.optional(),
  /* The device's interface locale: the server hides untranslated sets exactly as the app does
     when it checks access. Not saved (the profile's `locale` is the explicit choice). */
  locale: localeSchema.optional(),
});
/* Activity journal behind «Сокровищница». Built on the server from verified attempts and the
   coin ledger; the client only displays it (and extends it optimistically while offline). */
export const journalDaySchema = z.object({
  lessons: z.number().int().nonnegative(),
  perfect: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  evening: z.boolean(),
  frozen: z.boolean().optional(),
});
export const journalSchema = z.object({
  version: z.literal(1),
  days: z.record(z.string(), journalDaySchema),
  claimedQuests: z.record(z.string(), z.array(z.string())),
  trophies: z.record(z.string(), z.string()),
  bonusCoins: z.number().int().nonnegative(),
  spentCoins: z.number().int().nonnegative(),
  inventory: z.object({ items: z.array(z.string()), freezes: z.number().int().nonnegative() }),
});
export type JournalDay = z.infer<typeof journalDaySchema>;
export type Journal = z.infer<typeof journalSchema>;
const idSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const treasuryClaimSchema = z.object({ questId: idSchema, tzOffset: tzOffsetSchema });
export const treasuryBuySchema = z.object({ itemId: idSchema, tzOffset: tzOffsetSchema });
export const treasuryQuerySchema = z.object({ tzOffset: z.coerce.number().pipe(tzOffsetSchema) });
export type Attempt = z.infer<typeof attemptSchema>;
export type AccountProfile = {
  id: string;
  email: string;
  name: string;
  avatar: z.infer<typeof avatarSchema>;
  /** The language being learned right now (also the last one picked). */
  language: string;
  /** Every language the child learns; empty until the first pick. */
  languages: string[];
  /** The interface language the child chose; null = the device language. */
  locale: Locale | null;
  onboarded: boolean;
  legacyImported: boolean;
  unlockedMascotIds: string[];
  xp: number;
  coins: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  outfit: Outfit;
};
export type AccountSnapshot = {
  profile: AccountProfile;
  learning: z.infer<typeof learningStateSchema>;
  journal: Journal;
};
