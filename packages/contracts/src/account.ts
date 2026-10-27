import { z } from 'zod';
import {
  answerSchema,
  difficultySchema,
  learningStateSchema,
  reviewSchema,
  bossSchema,
  localeSchema,
  type Locale,
} from './course';
import type { Outfit } from './shop';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
/* A mascot id from the shop catalog (the app bundles fox/bear/rabbit/owl as fallback). */
export const avatarSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const languageCodeSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
/* The child's age is stored as a birth year (computed from the age they tap), so it grows by
   itself; it picks how much help «Собери слово» gives (`spellingHelp` in learning-core). */
export const birthYearSchema = z.number().int().min(2000).max(2100);
/* `PATCH /me`: any subset. The welcome screen sends name + avatar (that completes the
   onboarding); the language picker sends `language` (the current one, added to `languages`
   when new); the profile sends `locale` (the interface language); the age question sends
   `birthYear`. */
export const profileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    avatar: avatarSchema.optional(),
    language: languageCodeSchema.optional(),
    languages: z.array(languageCodeSchema).min(1).max(10).optional(),
    locale: localeSchema.optional(),
    birthYear: birthYearSchema.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'Пустой запрос.' });
/* The profile as the app caches it; `languages`/`locale`/`birthYear` are absent in caches from
   older app versions. */
export const profileSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: avatarSchema,
  language: languageCodeSchema,
  languages: z.array(languageCodeSchema).default([]),
  locale: localeSchema.nullable().default(null),
  birthYear: birthYearSchema.nullable().default(null),
  onboarded: z.boolean(),
});
export const attemptSchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().regex(/^[a-z0-9-]{1,80}$/),
  version: z.number().int().positive(),
  /** The age group the device played it for (absent: as published). */
  difficulty: difficultySchema.optional(),
  /** A review: the words and seed it was assembled from (`lessonId` is `review`). */
  review: reviewSchema.optional(),
  /** A set's challenge: the set, its lessons and the seed (`lessonId` is `boss`). */
  boss: bossSchema.optional(),
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
  /* Mechanics the app can show: the server leaves out the same lessons as the catalog it
     served this app (absent = the first three, `BASE_MECHANICS`). */
  mechanics: z.array(z.string().max(40)).max(40).optional(),
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
  /** Sets whose challenge was won (set id → day): their crown. */
  bosses: z.record(z.string(), z.string()).default({}),
  bonusCoins: z.number().int().nonnegative(),
  spentCoins: z.number().int().nonnegative(),
  /** Stars of every verified completion, repeats included: what opens sets. */
  stars: z.number().int().nonnegative().default(0),
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
  /** Null until the child answers «Сколько тебе лет?». */
  birthYear: number | null;
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
