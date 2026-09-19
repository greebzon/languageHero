import { fakePng, fakeWav } from './fake-media.js';
import type {
  CourseTextsPayload,
  WardrobeTextsPayload,
  LessonPayload,
  LessonTextsPayload,
  LessonTranslationPayload,
  PlanPayload,
  TranslationPayload,
} from './prompts.js';
import {
  ProviderError,
  type GenerationProvider,
  type ImageEditRequest,
  type ImageRequest,
  type RequestContext,
  type SpeechRequest,
  type TextRequest,
} from './provider.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic stand-in for the real provider: valid material, valid PNG/WAV, no network.
 * `input.simulate` fails a stage N times (retryable) or permanently so recovery paths get tested.
 */
export class FakeProvider implements GenerationProvider {
  readonly name = 'fake' as const;
  private failures = new Map<string, number>();
  readonly calls: { stage: string; targetId: string }[] = [];

  private async guard(context: RequestContext) {
    this.calls.push({ stage: context.stage, targetId: context.targetId });
    const simulate = context.simulate;
    if (!simulate || simulate.stage !== context.stage) return;
    if (simulate.targetId && simulate.targetId !== context.targetId) return;
    if (simulate.delayMs) await sleep(simulate.delayMs);
    const key = `${context.jobId}:${context.stage}:${context.targetId}`;
    const count = this.failures.get(key) ?? 0;
    if (simulate.permanent)
      throw new ProviderError('simulated permanent failure', 'permanent', 400, 'fake-req');
    if (count < simulate.times) {
      this.failures.set(key, count + 1);
      throw new ProviderError('simulated rate limit', 'retryable', 429, 'fake-req');
    }
  }

  async generateText(request: TextRequest) {
    await this.guard(request.context);
    const data =
      request.schemaName === 'course_plan'
        ? planFor(request.payload as PlanPayload)
        : request.schemaName === 'course_translation'
          ? translationFor(request.payload as TranslationPayload)
          : request.schemaName === 'lesson_translation'
            ? lessonTranslationFor(request.payload as LessonTranslationPayload)
            : request.schemaName === 'lesson_texts'
              ? lessonTextsFor(request.payload as LessonTextsPayload)
              : request.schemaName === 'course_texts'
                ? courseTextsFor(request.payload as CourseTextsPayload)
                : request.schemaName === 'mascot_texts' || request.schemaName === 'item_texts'
                  ? wardrobeTextsFor(request.payload as WardrobeTextsPayload)
                  : request.schemaName === 'mascot_slots'
                    ? {
                        head: { x: 0.28, y: 0.04, w: 0.44, h: 0.22 },
                        eyes: { x: 0.32, y: 0.2, w: 0.36, h: 0.1 },
                        outfit: { x: 0.26, y: 0.38, w: 0.48, h: 0.32 },
                        back: { x: 0.12, y: 0.3, w: 0.76, h: 0.45 },
                        companion: { x: 0.74, y: 0.3, w: 0.22, h: 0.22 },
                      }
                    : lessonFor(request.payload as LessonPayload);
    return {
      ok: true as const,
      data,
      usage: {
        inputTokens: request.user.length / 4,
        outputTokens: JSON.stringify(data).length / 4,
      },
      requestId: `fake-${request.context.stage}-${request.context.targetId}`,
    };
  }

  async generateImage(request: ImageRequest) {
    await this.guard(request.context);
    const [w, h] =
      request.size === '1536x1024'
        ? [144, 96]
        : request.size === '1024x1536'
          ? [96, 144]
          : [96, 96];
    return {
      png: fakePng(request.prompt, w, h),
      requestId: `fake-image-${request.context.targetId}`,
    };
  }

  async editImage(request: ImageEditRequest) {
    await this.guard(request.context);
    const [w, h] =
      request.size === '1536x1024'
        ? [144, 96]
        : request.size === '1024x1536'
          ? [96, 144]
          : [96, 96];
    return {
      png: fakePng(`${request.prompt}:${request.images.length}:${request.mask?.length ?? 0}`, w, h),
      requestId: `fake-edit-${request.context.targetId}`,
    };
  }

  async synthesizeSpeech(request: SpeechRequest) {
    await this.guard(request.context);
    return { wav: fakeWav(request.text), requestId: `fake-audio-${request.context.targetId}` };
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const wordBank = [
  'apple',
  'ball',
  'cat',
  'dog',
  'egg',
  'fish',
  'goat',
  'hat',
  'ice',
  'jam',
  'kite',
  'lion',
  'moon',
  'nest',
  'orange',
  'pig',
  'queen',
  'rain',
  'sun',
  'tree',
  'umbrella',
  'van',
  'wolf',
  'box',
  'yak',
  'zebra',
  'bear',
  'bee',
  'bird',
  'boat',
  'book',
  'bus',
  'cake',
  'car',
  'cow',
  'cup',
  'deer',
  'duck',
  'frog',
  'horse',
  'house',
  'milk',
  'mouse',
  'rabbit',
  'ship',
  'star',
];

function planFor(payload: PlanPayload) {
  const words = [...payload.targetWords];
  for (const candidate of wordBank) {
    if (words.length >= payload.wordCount) break;
    if (!words.includes(candidate) && !payload.existingWords.includes(candidate))
      words.push(candidate);
  }
  const vocabulary = words.map((word) => {
    const spelling =
      word
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, 12) || 'word';
    return {
      key: spelling,
      text: capitalize(spelling),
      spelling,
      translation: `Перевод ${spelling}`,
      imagePrompt: `A friendly cartoon ${spelling}`,
      speechText: capitalize(spelling),
    };
  });
  const perLesson = Math.max(
    2,
    Math.min(6, Math.ceil(vocabulary.length / payload.distribution.length)),
  );
  const lessons = payload.distribution.map((count, index) => {
    const start = (index * perLesson) % vocabulary.length;
    const keys = new Set<string>();
    for (let i = 0; keys.size < perLesson && i < vocabulary.length; i += 1)
      keys.add(vocabulary[(start + i) % vocabulary.length]!.key);
    return {
      title: `Урок ${index + 1}: ${payload.topic}`,
      goal: `Выучить слова ${[...keys].join(', ')} (${count} заданий)`,
      intro: `Тим приглашает в урок ${index + 1}!`,
      completionTitle: `Урок ${index + 1} пройден`,
      completionMessage: 'Ты справился, Тим гордится тобой!',
      wordKeys: [...keys],
    };
  });
  return { vocabulary, lessons };
}

function lessonFor(payload: LessonPayload) {
  const keys = payload.lesson.wordKeys;
  const exercises = Array.from({ length: payload.exerciseCount }, (_, i) => {
    const type = payload.mix[i % payload.mix.length]!;
    const word = keys[i % keys.length]!;
    const others = keys.filter((k) => k !== word);
    if (type === 'match-pairs')
      return {
        type,
        prompt: `Найди пары ${i + 1}`,
        hint: 'Соедини слово с картинкой',
        wordKey: '',
        choiceKeys: [],
        pairKeys: [word, ...others].slice(0, 2 + (i % 3)),
        distractorLetters: '',
      };
    if (type === 'listen-and-select')
      return {
        type,
        prompt: `Послушай и выбери ${i + 1}`,
        hint: `Это слово начинается на «${word[0]}»`,
        wordKey: word,
        choiceKeys: [word, ...others].slice(0, 2 + (i % 3)),
        pairKeys: [],
        distractorLetters: '',
      };
    return {
      type,
      prompt: `Собери слово ${i + 1}`,
      hint: 'Начни с первой буквы',
      wordKey: word,
      choiceKeys: [],
      pairKeys: [],
      distractorLetters: 'qz',
    };
  });
  return { exercises };
}

/** "Translation" that is visibly different and still spellable: the language code is appended. */
function translationFor(payload: TranslationPayload) {
  const suffix = payload.language.replace(/[^a-z]/g, '');
  return {
    words: payload.words.map((w) => ({
      key: w.key,
      text: capitalize(`${w.spelling}${suffix}`),
      spelling: `${w.spelling}${suffix}`,
      speechText: capitalize(`${w.spelling}${suffix}`),
    })),
    lessons: payload.lessons.map((l) => ({
      title: `${l.title} (${payload.language})`,
      intro: l.intro ?? '',
      completionTitle: l.completionTitle ?? '',
      completionMessage: l.completionMessage ?? '',
    })),
  };
}

function lessonTranslationFor(payload: LessonTranslationPayload) {
  return {
    exercises: payload.exercises.map((e) => ({
      prompt: e.prompt,
      hint: e.hint,
      distractorLetters: e.type === 'build-word' ? 'qz' : '',
    })),
  };
}

/** Interface translations: the Russian text tagged with the locale, every id kept. */
function lessonTextsFor(payload: LessonTextsPayload) {
  const tag = (locale: string, text: string) => `[${locale}] ${text}`.slice(0, 90);
  const l = payload.lesson;
  return {
    locales: payload.locales.map((locale) => ({
      locale,
      title: tag(locale, l.title),
      presentation: l.presentation
        ? {
            intro: tag(locale, l.presentation.intro),
            completionTitle: tag(locale, l.presentation.completionTitle),
            completionMessage: tag(locale, l.presentation.completionMessage),
          }
        : null,
      exercises: l.exercises.map((e) => ({
        id: e.id,
        prompt: tag(locale, e.prompt),
        hint: tag(locale, e.hint),
      })),
      words: l.words.map((w) => ({ id: w.id, translation: tag(locale, w.translation) })),
    })),
  };
}
function wardrobeTextsFor(payload: WardrobeTextsPayload) {
  return {
    locales: payload.locales.map((locale) => ({
      locale,
      ...Object.fromEntries(
        Object.entries(payload.fields).map(([k, v]) => [k, `[${locale}] ${v}`.slice(0, 38)]),
      ),
    })),
  };
}
function courseTextsFor(payload: CourseTextsPayload) {
  return {
    locales: payload.locales.map((locale) => ({
      locale,
      title: `[${locale}] ${payload.title}`.slice(0, 90),
      description: payload.description ? `[${locale}] ${payload.description}`.slice(0, 190) : null,
      languageTitle: `[${locale}] ${payload.languageTitle}`,
    })),
  };
}
