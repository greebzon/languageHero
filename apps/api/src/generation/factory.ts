import type { ModelConfig } from '../db/schema.js';
import type { env as Env } from '../env.js';
import type { CostRates } from './estimate.js';
import { FakeProvider } from './fake-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import type { GenerationProvider } from './provider.js';

type GenerationEnv = Pick<
  typeof Env,
  | 'GENERATION_PROVIDER'
  | 'OPENAI_API_KEY'
  | 'OPENAI_TEXT_MODEL'
  | 'OPENAI_IMAGE_MODEL'
  | 'OPENAI_EDIT_MODEL'
  | 'OPENAI_IMAGE_QUALITY'
  | 'OPENAI_TTS_MODEL'
  | 'OPENAI_TTS_VOICE'
  | 'GENERATION_MAX_EXERCISES'
  | 'GENERATION_LESSON_SIZE'
  | 'GENERATION_WORDS_PER_LESSON'
  | 'GENERATION_COST_LIMIT_USD'
  | 'OPENAI_IMAGE_COST_USD'
  | 'OPENAI_TTS_COST_PER_1K_CHARS_USD'
  | 'OPENAI_TEXT_COST_PER_1K_TOKENS_USD'
>;

/** Everything the API and the worker need to agree on, derived from the environment once. */
export type GenerationSettings = {
  provider: GenerationProvider | null;
  /** Why the provider is unavailable (shown to the admin), or null when it is ready. */
  unavailableReason: string | null;
  modelConfig: ModelConfig;
  rates: CostRates;
  limits: {
    minExercises: number;
    maxExercises: number;
    lessonSize: number;
    maxPerLesson: number;
    wordsPerLesson: number;
    maxWords: number;
  };
  costLimitUsd: number;
};

export function generationSettings(e: GenerationEnv): GenerationSettings {
  const fake = e.GENERATION_PROVIDER === 'fake';
  const provider = fake
    ? new FakeProvider()
    : e.OPENAI_API_KEY
      ? new OpenAIProvider({ apiKey: e.OPENAI_API_KEY })
      : null;
  return {
    provider,
    unavailableReason: provider
      ? null
      : 'Ключ OPENAI_API_KEY не задан на сервере — генерация недоступна, ручное редактирование работает',
    modelConfig: fake
      ? {
          text: 'fake',
          image: 'fake',
          edit: 'fake',
          imageQuality: 'low',
          tts: 'fake',
          voice: 'fake',
        }
      : {
          text: e.OPENAI_TEXT_MODEL,
          image: e.OPENAI_IMAGE_MODEL,
          edit: e.OPENAI_EDIT_MODEL ?? e.OPENAI_IMAGE_MODEL,
          imageQuality: e.OPENAI_IMAGE_QUALITY,
          tts: e.OPENAI_TTS_MODEL,
          voice: e.OPENAI_TTS_VOICE,
        },
    rates: {
      imageUsd: e.OPENAI_IMAGE_COST_USD,
      ttsPer1kCharsUsd: e.OPENAI_TTS_COST_PER_1K_CHARS_USD,
      textPer1kTokensUsd: e.OPENAI_TEXT_COST_PER_1K_TOKENS_USD,
    },
    limits: {
      minExercises: 6,
      maxExercises: e.GENERATION_MAX_EXERCISES,
      lessonSize: e.GENERATION_LESSON_SIZE,
      maxPerLesson: 30,
      wordsPerLesson: e.GENERATION_WORDS_PER_LESSON,
      maxWords: 40,
    },
    costLimitUsd: e.GENERATION_COST_LIMIT_USD,
  };
}
