import type {
  CourseLesson,
  CourseTexts,
  CourseVisibility,
  DraftTexts,
  LanguageTitles,
  LanguageStatus,
  LessonDocument,
  LessonPresentation,
  Release,
} from '@lingvohero/contracts';

export type AdminUser = { id: string; login: string };

export type Language = {
  code: string;
  title: string;
  direction: 'ltr' | 'rtl';
  locale: string | null;
  titles: LanguageTitles;
  status: LanguageStatus;
  position: number;
  publishedAt: string | null;
  courseCount: number;
};

export type Asset = {
  id: string;
  sha256: string;
  kind: 'image' | 'audio';
  mime: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: 'draft' | 'published';
  provenance: { source: 'upload' | 'import'; uploadedBy?: string; originalName?: string };
  altText: string | null;
  createdAt: string;
  url: string;
};

export type Course = {
  id: string;
  languageCode: string;
  topic: string | null;
  title: string;
  description: string | null;
  texts: CourseTexts;
  coverAssetId: string | null;
  unlockStars: number | null;
  position: number;
  visibility: CourseVisibility;
  editRevision: number;
  publishedRevision: number | null;
  updatedAt: string;
  cover: Asset | null;
  lessonCount: number;
};

export type LessonSummary = {
  id: string;
  courseId: string;
  position: number;
  title: string;
  exerciseCount: number;
  wordCount: number;
  editRevision: number;
  lastPublishedVersion: number | null;
  updatedAt: string;
  translations?: Record<'en' | 'he', 'ok' | 'missing' | 'stale'>;
};

export type Lesson = {
  id: string;
  courseId: string;
  position: number;
  title: string;
  presentation: LessonPresentation | null;
  document: LessonDocument;
  texts: DraftTexts;
  editRevision: number;
  lastPublishedVersion: number | null;
  updatedAt: string;
  translations?: Record<'en' | 'he', 'ok' | 'missing' | 'stale'>;
};

export type Preview = {
  lesson: CourseLesson;
  mediaUrls: Record<string, string>;
  courseId: string;
};

export type BuildIssue = {
  entity: 'language' | 'course' | 'lesson' | 'catalog';
  id: string;
  fieldErrors: Record<string, string[]>;
};
export type BuildWarning = { entity: BuildIssue['entity']; id: string; message: string };

export type CatalogDiff = {
  languages: { added: string[]; removed: string[] };
  courses: { added: string[]; removed: string[]; changed: string[] };
  previews: { added: string[]; removed: string[] };
  lessons: { id: string; title: string; from: number | null; to: number }[];
};

export type Publication = {
  id: string;
  kind: 'release' | 'restore';
  baseCatalogRevision: number;
  targetRevision: number;
  releaseHash: string;
  status: 'prepared' | 'publishing' | 'published' | 'failed';
  actorId: string | null;
  actorLogin: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  summary: { languages: number; courses: number; previews: number; lessons: number };
};

export type PlanResponse = {
  publication: Publication;
  diff: CatalogDiff;
  warnings: BuildWarning[];
};
export type { Release };

export type GenerationStage =
  'plan' | 'text' | 'review' | 'media-plan' | 'cover' | 'image' | 'audio' | 'assemble';
export type GenerationJobStatus = 'queued' | 'running' | 'awaiting-review' | 'failed' | 'cancelled';
export type GenerationTaskStatus =
  'pending' | 'running' | 'succeeded' | 'retry-wait' | 'failed' | 'cancelled';

export type GenerationSettings = {
  providerReady: boolean;
  providerName: 'openai' | 'fake' | null;
  unavailableReason: string | null;
  limits: {
    minExercises: number;
    maxExercises: number;
    lessonSize: number;
    maxPerLesson: number;
    wordsPerLesson: number;
    maxWords: number;
  };
  costLimitUsd: number;
  models: { text: string; image: string; imageQuality: string; tts: string; voice: string };
  rates: { imageUsd: number; ttsPer1kCharsUsd: number; textPer1kTokensUsd: number };
};

export type GenerationEstimate = {
  distribution: number[];
  lessons: number;
  words: number;
  images: number;
  audios: number;
  textTokens: number;
  estimatedUsd: number;
};

export type GenerationJob = {
  id: string;
  kind: 'course' | 'mascot' | 'item' | 'cover' | 'texts';
  courseId: string | null;
  subjectId: string | null;
  status: GenerationJobStatus;
  input: {
    topic: string;
    totalExercises: number;
    lessonSize: number;
    wordCount: number | null;
    targetWords: string[];
    mix: ('listen-and-select' | 'match-pairs' | 'build-word')[];
    style: string | null;
    voice: string | null;
    source?: { courseId: string };
  };
  modelConfig: GenerationSettings['models'];
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    images: number;
    ttsChars: number;
    estimatedUsd: number;
  };
  costLimitUsd: number;
  warnings: string[];
  error: string | null;
  actorLogin: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: {
    distribution: number[];
    words: { key: string; text: string; translation: string }[];
    lessons: {
      lessonId: string;
      title: string;
      goal: string;
      exerciseCount: number;
      hasText: boolean;
    }[];
    media: { images: number; audios: number; cover: boolean } | null;
    conflicts: { lessonId: string; title: string }[];
  } | null;
};

export type GenerationTask = {
  id: string;
  stage: GenerationStage;
  stageLabel: string;
  targetId: string;
  status: GenerationTaskStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  requestId: string | null;
  output: { assetId?: string; reusedFrom?: string; exercises?: number; problems?: string } | null;
  updatedAt: string;
};

export type GenerationView = {
  job: GenerationJob;
  tasks: GenerationTask[];
  progress: { done: number; total: number };
  stages: { stage: GenerationStage; label: string; tasks: number; done: number; failed: number }[];
  allowed: { cancel: boolean; retryTaskIds: string[]; applyConflicts: boolean };
};

/* --- Mascots and the wardrobe shop --- */
export type MascotSlot = 'head' | 'eyes' | 'outfit' | 'back' | 'companion';
export type ShopRarity = 'common' | 'magic' | 'legendary';
export type SlotBox = { x: number; y: number; w: number; h: number };
export type Mascot = {
  unlockLevel: number;
  id: string;
  name: string;
  withName: string;
  trait: string;
  perk: string;
  description: string;
  sourceAssetId: string | null;
  sourceUrl: string | null;
  bodyUrl: string | null;
  portraitUrl: string | null;
  slots: Record<MascotSlot, SlotBox> | null;
  texts: Partial<Record<'en' | 'he', Record<string, string | undefined>>>;
  translations: Record<'en' | 'he', 'ok' | 'missing' | 'stale'>;
  ready: boolean;
  published: boolean;
  position: number;
  layers: number;
  activeJobId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ShopItem = {
  id: string;
  name: string;
  description: string;
  slot: MascotSlot;
  rarity: ShopRarity;
  price: number;
  prompt: string;
  sourceAssetId: string | null;
  sourceUrl: string | null;
  iconUrl: string | null;
  texts: Partial<Record<'en' | 'he', Record<string, string | undefined>>>;
  translations: Record<'en' | 'he', 'ok' | 'missing' | 'stale'>;
  ready: boolean;
  published: boolean;
  position: number;
  layers: number;
  activeJobId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type OutfitLayerView = {
  mascotId: string;
  itemId: string;
  url: string | null;
  box: SlotBox;
  updatedAt: string;
};
export type MascotDetail = {
  mascot: Mascot;
  items: { item: ShopItem; layer: OutfitLayerView | null }[];
  jobs: GenerationJob[];
};
export type ShopItemDetail = {
  item: ShopItem;
  mascots: { mascot: Mascot; layer: OutfitLayerView | null }[];
  jobs: GenerationJob[];
};
