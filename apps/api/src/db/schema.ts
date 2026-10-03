import { sql } from 'drizzle-orm';
import type { LearningState, Locale, Outfit } from '@lingvohero/contracts';
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type {
  CourseTexts,
  CourseVisibility,
  DraftTexts,
  GenerationInput,
  GenerationOutput,
  ItemTexts,
  LanguageStatus,
  LanguageTitles,
  LessonDocument,
  LessonPresentation,
  MascotTexts,
  MascotSlot,
  MascotSlots,
  Release,
  ShopRarity,
  SlotBox,
} from '@lingvohero/contracts';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const learnerAccounts = pgTable(
  'learner_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull().default(''),
    avatar: text('avatar').notNull().default('fox'),
    /** Null only for accounts awaiting migration from the old fixed XP step. */
    levelFloor: integer('level_floor').default(1),
    /** The current learning language; `languages` holds all of them (empty until the first pick). */
    language: text('language').notNull().default('en'),
    languages: jsonb('languages').$type<string[]>().notNull().default([]),
    /** Interface language the child chose (ru/en/he); null = the device language. */
    uiLocale: text('ui_locale').$type<Locale>(),
    onboarded: integer('onboarded').notNull().default(0),
    recoveryHash: text('recovery_hash'),
    legacyImported: integer('legacy_imported').notNull().default(0),
    /* Minutes east of UTC on the learner's last device, for «сегодня» in quests. */
    tzOffset: integer('tz_offset').notNull().default(0),
    /** Last big time-zone jump; another is allowed a day later (quests follow «сегодня»). */
    tzChangedAt: timestamp('tz_changed_at', { withTimezone: true }),
    /** What the mascot wears (slot → shop item id); only owned items pass validation. */
    outfit: jsonb('outfit').$type<Outfit>().notNull().default({}),
    learning: jsonb('learning')
      .$type<LearningState>()
      .notNull()
      .default({ version: 2, soundEnabled: true, progress: {}, session: null }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('learner_accounts_recovery').on(table.recoveryHash)],
);
export const learnerMascots = pgTable('learner_mascots', {
  key: text('key').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => learnerAccounts.id, { onDelete: 'cascade' }),
  mascotId: text('mascot_id').notNull(),
  createdAt: createdAt(),
});
export const learnerSessions = pgTable('learner_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => learnerAccounts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  deviceName: text('device_name').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
export const learnerChallenges = pgTable(
  'learner_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    purpose: text('purpose').notNull(),
    userId: uuid('user_id').references(() => learnerAccounts.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('learner_challenges_email_created').on(table.email, table.createdAt)],
);
export const learnerAttempts = pgTable(
  'learner_attempts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => learnerAccounts.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    version: integer('version').notNull(),
    stars: integer('stars').notNull(),
    /* Words in the lesson package, for the «новые слова» quest. */
    words: integer('words').notNull().default(0),
    payloadHash: text('payload_hash').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('learner_attempts_user').on(table.userId)],
);
export const learnerDevices = pgTable('learner_devices', {
  key: text('key').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => learnerAccounts.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  updatedAt: updatedAt(),
});
export const learnerRewards = pgTable('learner_rewards', {
  key: text('key').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => learnerAccounts.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull(),
  xp: integer('xp').notNull(),
  coins: integer('coins').notNull(),
  source: text('source').notNull(),
  createdAt: createdAt(),
});
/* Every coin outside lesson rewards: quest claims, trophies, shop purchases, chest drops and
   spent streak freezes. `key` makes each grant idempotent (quest per day, trophy once, item once). */
export const learnerLedger = pgTable(
  'learner_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => learnerAccounts.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    kind: text('kind').$type<'quest' | 'trophy' | 'purchase' | 'chest' | 'freeze'>().notNull(),
    ref: text('ref').notNull(),
    day: text('day').notNull(),
    coins: integer('coins').notNull(),
    itemId: text('item_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('learner_ledger_user_key').on(t.userId, t.key)],
);

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  login: text('login').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'admin'>().notNull().default('admin'),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const adminSessions = pgTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => adminUsers.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const languages = pgTable('languages', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  direction: text('direction').$type<'ltr' | 'rtl'>().notNull().default('ltr'),
  locale: text('locale'),
  titles: jsonb('titles').$type<LanguageTitles>().notNull().default({}),
  status: text('status').$type<LanguageStatus>().notNull().default('draft'),
  position: integer('position').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type AssetProvenance = {
  source: 'upload' | 'import' | 'generated' | 'rendition';
  /** For renditions: the original picture this smaller copy was made from. */
  renditionOf?: string;
  uploadedBy?: string;
  originalName?: string;
  /** For generated media: which model and prompt produced the file. */
  model?: string;
  promptVersion?: string;
  prompt?: string;
};
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  sha256: text('sha256').notNull().unique(),
  kind: text('kind').$type<'image' | 'audio'>().notNull(),
  mime: text('mime').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  // 'draft' = ADMIN_STORAGE_ROOT/<sha>.<ext>; 'store' = content/store/media/<sha>.<ext>
  storageKey: text('storage_key').$type<'draft' | 'store'>().notNull(),
  status: text('status').$type<'draft' | 'published'>().notNull().default('draft'),
  provenance: jsonb('provenance').$type<AssetProvenance>().notNull(),
  altText: text('alt_text'),
  transcript: text('transcript'),
  generationTaskId: uuid('generation_task_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * What the app gets instead of an original picture: a copy no larger than `box` (`512x768`),
 * made once and reused so a release stays byte-for-byte stable. `asset_id` equals the source
 * when the original is already small enough.
 */
export const assetRenditions = pgTable(
  'asset_renditions',
  {
    sourceAssetId: uuid('source_asset_id')
      .notNull()
      .references((): AnyPgColumn => assets.id),
    box: text('box').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references((): AnyPgColumn => assets.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('asset_renditions_source_box').on(table.sourceAssetId, table.box)],
);

export const courses = pgTable('courses', {
  id: text('id').primaryKey(),
  languageCode: text('language_code')
    .notNull()
    .references(() => languages.code),
  topic: text('topic'),
  title: text('title').notNull(),
  description: text('description'),
  texts: jsonb('texts').$type<CourseTexts>().notNull().default({}),
  coverAssetId: uuid('cover_asset_id').references((): AnyPgColumn => assets.id),
  /** Stars a child needs to open the set (0 = open from the start); null keeps the old rule:
      the set opens once the previous one is complete. */
  unlockStars: integer('unlock_stars'),
  position: integer('position').notNull().default(0),
  visibility: text('visibility').$type<CourseVisibility>().notNull().default('draft'),
  editRevision: integer('edit_revision').notNull().default(1),
  publishedRevision: integer('published_revision'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const lessons = pgTable('lessons', {
  id: text('id').primaryKey(),
  courseId: text('course_id')
    .notNull()
    .references(() => courses.id),
  position: integer('position').notNull().default(0),
  title: text('title').notNull(),
  presentation: jsonb('presentation').$type<LessonPresentation>(),
  document: jsonb('document').$type<LessonDocument>().notNull(),
  texts: jsonb('texts').$type<DraftTexts>().notNull().default({}),
  editRevision: integer('edit_revision').notNull().default(1),
  lastPublishedVersion: integer('last_published_version'),
  lastPublishedHash: text('last_published_hash'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type PlanLesson = { lessonId: string; version: number; hash: string; editRevision: number };
export type PublicationStatus = 'prepared' | 'publishing' | 'published' | 'failed';
export const publications = pgTable(
  'publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<'release' | 'restore'>().notNull().default('release'),
    baseCatalogRevision: integer('base_catalog_revision').notNull(),
    targetRevision: integer('target_revision').notNull(),
    releaseHash: text('release_hash').notNull(),
    snapshot: jsonb('snapshot').$type<Release>().notNull(),
    lessons: jsonb('lessons').$type<PlanLesson[]>().notNull(),
    status: text('status').$type<PublicationStatus>().notNull().default('prepared'),
    actorId: uuid('actor_id').references(() => adminUsers.id),
    error: text('error'),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  // Several plans may target the same next revision; only one may actually be published.
  (table) => [
    uniqueIndex('publications_target_revision_committed')
      .on(table.targetRevision)
      .where(sql`${table.status} in ('publishing', 'published')`),
  ],
);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => adminUsers.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

// --- Mascots and the wardrobe shop (published to the app as the shop catalog).
export const mascots = pgTable('mascots', {
  unlockLevel: integer('unlock_level').notNull().default(1),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  withName: text('with_name').notNull(),
  trait: text('trait').notNull(),
  perk: text('perk').notNull(),
  description: text('description').notNull(),
  /** Reference picture the admin uploaded; the base body is derived from it. */
  sourceAssetId: uuid('source_asset_id').references((): AnyPgColumn => assets.id),
  /** Full body on a transparent background (1024×1536): the layer canvas. */
  bodyAssetId: uuid('body_asset_id').references((): AnyPgColumn => assets.id),
  /** Round badge portrait for pickers and headers. */
  portraitAssetId: uuid('portrait_asset_id').references((): AnyPgColumn => assets.id),
  /** Where each wearable slot sits on the body image (normalized boxes). */
  slots: jsonb('slots').$type<MascotSlots>(),
  /** Name, «вместе с …», trait and perk in the other interface locales. */
  texts: jsonb('texts').$type<MascotTexts>().notNull().default({}),
  published: integer('published').notNull().default(0),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const shopItems = pgTable('shop_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  slot: text('slot').$type<MascotSlot>().notNull(),
  rarity: text('rarity').$type<ShopRarity>().notNull(),
  price: integer('price').notNull(),
  prompt: text('prompt').notNull(),
  sourceAssetId: uuid('source_asset_id').references((): AnyPgColumn => assets.id),
  /** The item alone on a transparent background: shop card and reference for layers. */
  iconAssetId: uuid('icon_asset_id').references((): AnyPgColumn => assets.id),
  /** Name and description in the other interface locales. */
  texts: jsonb('texts').$type<ItemTexts>().notNull().default({}),
  published: integer('published').notNull().default(0),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
/** The item drawn on that mascot's body; the app crops the layer to `box`. */
export const outfitLayers = pgTable(
  'outfit_layers',
  {
    mascotId: text('mascot_id')
      .notNull()
      .references(() => mascots.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => shopItems.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references((): AnyPgColumn => assets.id),
    box: jsonb('box').$type<SlotBox>().notNull(),
    taskId: uuid('task_id'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('outfit_layers_pair').on(t.mascotId, t.itemId)],
);

// --- Generation queue (stage C). Jobs are immutable input snapshots; tasks are leased units of work.
export type GenerationJobStatus = 'queued' | 'running' | 'awaiting-review' | 'failed' | 'cancelled';
export type GenerationTaskStatus =
  'pending' | 'running' | 'succeeded' | 'retry-wait' | 'failed' | 'cancelled';
/** Course jobs run plan…assemble; mascot/item/cover jobs run the asset stages (see
 *  worker/asset-stages). A cover job redraws one set's cover and carries its `courseId`. */
export type GenerationJobKind = 'course' | 'mascot' | 'item' | 'cover' | 'texts';
export type GenerationStage =
  | 'plan'
  | 'text'
  | 'review'
  | 'media-plan'
  | 'cover'
  | 'image'
  | 'audio'
  | 'assemble'
  | 'mascot-base'
  | 'mascot-portrait'
  | 'mascot-slots'
  | 'item-icon'
  | 'outfit-layer'
  | 'course-cover'
  | 'lesson-texts'
  | 'course-texts'
  | 'mascot-texts'
  | 'item-texts';
export type ModelConfig = {
  text: string;
  image: string;
  /** Model for image edits; jobs from before it existed fall back to `image`. */
  edit?: string;
  imageQuality: string;
  tts: string;
  voice: string;
};
export type GenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  images: number;
  ttsChars: number;
  estimatedUsd: number;
};
export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').$type<GenerationJobKind>().notNull().default('course'),
  courseId: text('course_id').references(() => courses.id),
  /** Mascot or shop item id for asset jobs. */
  subjectId: text('subject_id'),
  status: text('status').$type<GenerationJobStatus>().notNull().default('queued'),
  input: jsonb('input').$type<GenerationInput>().notNull(),
  modelConfig: jsonb('model_config').$type<ModelConfig>().notNull(),
  promptVersion: text('prompt_version').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  requestedBy: uuid('requested_by').references(() => adminUsers.id),
  usage: jsonb('usage').$type<GenerationUsage>().notNull(),
  costLimitUsd: real('cost_limit_usd').notNull(),
  output: jsonb('output').$type<GenerationOutput>(),
  warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
  error: text('error'),
  createdAt: createdAt(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
export const generationTasks = pgTable(
  'generation_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => generationJobs.id),
    stage: text('stage').$type<GenerationStage>().notNull(),
    targetId: text('target_id').notNull(),
    position: integer('position').notNull().default(0),
    inputHash: text('input_hash'),
    output: jsonb('output').$type<Record<string, unknown>>(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    status: text('status').$type<GenerationTaskStatus>().notNull().default('pending'),
    leaseOwner: text('lease_owner'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    providerRequestId: text('provider_request_id'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('generation_tasks_job_stage_target').on(table.jobId, table.stage, table.targetId),
    index('generation_tasks_status_next').on(table.status, table.nextAttemptAt),
    index('generation_tasks_input_hash').on(table.inputHash),
  ],
);
