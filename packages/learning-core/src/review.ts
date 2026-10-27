import {
  REVIEW_LESSON_ID,
  type CourseExercise,
  type CourseLesson,
  type LearningState,
  type LessonTexts,
  type ReviewWord,
  type Word,
} from '@lingvohero/contracts';
import { seeded } from './mechanics/adapt';

/*
 * «Повторение»: a lesson assembled on the device from words of lessons the child completed,
 * different every time (the seed) and free (no generation: every exercise is built from the
 * words' own pictures and recordings). Words from lessons with fewer stars come first.
 * `composeReview` is pure, so the server rebuilds the very same lesson from the attempt's
 * words and seed and checks the answers.
 */
export const REVIEW_MIN_WORDS = 3;
export const REVIEW_WORDS = 6;

type Locale = 'ru' | 'en' | 'he';
type Kind =
  'listen' | 'find-picture' | 'pairs' | 'is-it' | 'spell' | 'name-picture' | 'first-sound';
/** The order of tasks: never the same mechanic twice in a row. */
const PLAN: Kind[] = [
  'listen',
  'find-picture',
  'pairs',
  'is-it',
  'spell',
  'name-picture',
  'listen',
  'first-sound',
];

/* Texts of the review in every interface locale: the lesson is made here, not in the panel. */
const TEXTS: Record<
  Locale,
  {
    title: string;
    intro: string;
    completionTitle: string;
    completionMessage: string;
    tasks: Record<Kind, [prompt: string, hint: string]>;
  }
> = {
  ru: {
    title: 'Повторение',
    intro: 'Повторим слова, которые уже знакомы!',
    completionTitle: 'Повторение пройдено!',
    completionMessage: 'Слова запоминаются всё лучше. Приходи повторить ещё!',
    tasks: {
      listen: ['Найди картинку по звуку', 'Послушай ещё раз и вспомни картинку'],
      'find-picture': ['Найди картинку', 'Вспомни, как выглядит это слово'],
      pairs: ['Соедини слова и картинки', 'Соедини каждое слово с его картинкой'],
      'is-it': ['Это правильное слово?', 'Посмотри внимательно на картинку'],
      spell: ['Собери слово', 'Начни с первой буквы'],
      'name-picture': ['Как это называется?', 'Прочитай слова по очереди'],
      'first-sound': ['С какой буквы начинается слово?', 'Послушай первый звук слова'],
    },
  },
  en: {
    title: 'Review',
    intro: 'Let’s review the words you already know!',
    completionTitle: 'Review done!',
    completionMessage: 'The words stick better every time. Come back to review again!',
    tasks: {
      listen: ['Find the picture you hear', 'Listen again and remember the picture'],
      'find-picture': ['Find the picture', 'Remember what this word looks like'],
      pairs: ['Match the words and pictures', 'Match each word with its picture'],
      'is-it': ['Is this the right word?', 'Look closely at the picture'],
      spell: ['Build the word', 'Start with the first letter'],
      'name-picture': ['What is it called?', 'Read the words one by one'],
      'first-sound': ['Which letter does the word start with?', 'Listen to the first sound'],
    },
  },
  he: {
    title: 'חזרה',
    intro: 'חוזרים על מילים שכבר מכירים!',
    completionTitle: 'החזרה הושלמה!',
    completionMessage: 'המילים נזכרות טוב יותר בכל פעם. חוזרים שוב!',
    tasks: {
      listen: ['מוצאים את התמונה של המילה ששומעים', 'מקשיבים שוב ונזכרים בתמונה'],
      'find-picture': ['מוצאים את התמונה', 'נזכרים איך המילה נראית'],
      pairs: ['מחברים מילים ותמונות', 'מחברים כל מילה לתמונה שלה'],
      'is-it': ['זו המילה הנכונה?', 'מסתכלים היטב על התמונה'],
      spell: ['מרכיבים את המילה', 'מתחילים מהאות הראשונה'],
      'name-picture': ['איך קוראים לזה?', 'קוראים את המילים אחת אחרי השנייה'],
      'first-sound': ['באיזו אות המילה מתחילה?', 'מקשיבים לצליל הראשון'],
    },
  },
};

type PoolEntry = { lesson: CourseLesson; word: Word };
/** Every word of these lessons once (a word met again keeps its latest lesson). */
export function reviewPool(lessons: CourseLesson[]): PoolEntry[] {
  const byId = new Map<string, PoolEntry>();
  for (const lesson of lessons)
    for (const word of lesson.words) byId.set(word.id, { lesson, word });
  return [...byId.values()];
}

/**
 * The words of one review: words from lessons with fewer stars are likelier, the rest by
 * chance (weighted sampling, deterministic for the seed).
 */
export function pickReviewWords(
  pool: PoolEntry[],
  progress: LearningState['progress'],
  seed: string,
  count = REVIEW_WORDS,
): ReviewWord[] {
  const rand = seeded(`pick:${seed}`);
  return pool
    .map((entry) => {
      const weight = 4 - (progress[entry.lesson.id]?.bestStars ?? 3);
      return { entry, key: rand() ** (1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map(({ entry }) => ({
      lessonId: entry.lesson.id,
      version: entry.lesson.version,
      wordId: entry.word.id,
    }));
}

/** The review lesson from its words (each with the lesson it was learned in) and seed. */
export function composeReview(
  entries: { lesson: CourseLesson; wordId: string }[],
  seed: string,
): CourseLesson {
  const rand = seeded(`review:${seed}`);
  const shuffled = <T>(items: T[]) => shuffle(items, rand);
  const sources = entries.map(({ lesson, wordId }) => {
    const word = lesson.words.find((w) => w.id === wordId);
    if (!word) throw new Error(`No word ${wordId} in ${lesson.id}`);
    return { lesson, word };
  });
  // Media ids are the word's own (`<word>-image`), whatever the source lesson called them.
  const words: Word[] = sources.map(({ word }) => ({
    ...word,
    imageId: `${word.id}-image`,
    audioId: `${word.id}-audio`,
  }));
  const media = sources.flatMap(({ lesson, word }) => {
    const image = lesson.media.find((m) => m.id === word.imageId)!;
    const audio = lesson.media.find((m) => m.id === word.audioId)!;
    return [
      { ...image, id: `${word.id}-image` },
      { ...audio, id: `${word.id}-audio` },
    ];
  });
  const ids = words.map((w) => w.id);
  const order = shuffled(ids);
  let turn = 0;
  const target = () => order[turn++ % order.length]!;
  const others = (id: string, n: number) => shuffled(ids.filter((x) => x !== id)).slice(0, n);
  const spelling = (id: string) =>
    Array.from(words.find((w) => w.id === id)!.spelling.normalize('NFC'));

  const exercises: (CourseExercise & { kind: Kind })[] = [];
  for (const [index, planned] of PLAN.entries()) {
    const id = `review-${index + 1}`;
    const [prompt, hint] = TEXTS.ru.tasks[planned];
    const base = { id, prompt, hint };
    const w = target();
    const build = (kind: Kind): CourseExercise | null => {
      if (kind === 'listen')
        return {
          ...base,
          type: 'listen-and-select',
          wordId: w,
          choices: shuffled([w, ...others(w, 3)]),
        };
      if (kind === 'find-picture' || kind === 'name-picture') {
        const options = shuffled([w, ...others(w, 3)]).map((x) => ({ id: x, wordId: x }));
        return {
          ...base,
          type: 'choice',
          show: [{ view: kind === 'find-picture' ? 'text' : 'image', wordId: w }],
          as: kind === 'find-picture' ? 'image' : 'text',
          options,
          answerId: w,
        };
      }
      if (kind === 'pairs') {
        const pair = [w, ...others(w, 2)];
        return { ...base, type: 'match-pairs', wordIds: pair, imageOrder: shuffled(pair) };
      }
      if (kind === 'is-it') {
        const yes = rand() < 0.5;
        const claim = yes ? w : others(w, 1)[0]!;
        return {
          ...base,
          type: 'choice',
          show: [
            { view: 'image', wordId: w },
            { view: 'text', wordId: claim },
          ],
          as: 'yes-no',
          options: [{ id: 'yes' }, { id: 'no' }],
          answerId: yes ? 'yes' : 'no',
        };
      }
      if (kind === 'spell') {
        const letters = spelling(w);
        // Extra letters from the other words, so the script stays the same.
        const extra = shuffled(
          [...new Set(ids.flatMap((x) => (x === w ? [] : spelling(x))))].filter(
            (l) => !letters.includes(l),
          ),
        ).slice(0, 2);
        if (!extra.length || letters.length + extra.length > 30) return null;
        return {
          ...base,
          type: 'build-word',
          wordId: w,
          tiles: shuffled([...letters, ...extra]).map((letter, i) => ({ id: `t${i + 1}`, letter })),
        };
      }
      // first-sound
      const first = spelling(w)[0]!;
      const pool = [
        ...others(w, ids.length).map((x) => spelling(x)[0]!),
        ...ids.flatMap(spelling),
      ].filter((l, i, all) => l !== first && all.indexOf(l) === i);
      if (!pool.length) return null;
      const letters = shuffled([first, ...pool.slice(0, 2)]).map((letter, i) => ({
        id: `l${i + 1}`,
        letter,
      }));
      return {
        ...base,
        type: 'choice',
        show: [
          { view: 'image', wordId: w },
          { view: 'audio', wordId: w },
        ],
        as: 'letter',
        options: letters,
        answerId: letters.find((l) => l.letter === first)!.id,
      };
    };
    // A task the words cannot make (no extra letters) becomes «find the picture».
    const kind = build(planned) ? planned : 'find-picture';
    const exercise = build(kind)!;
    const [kindPrompt, kindHint] = TEXTS.ru.tasks[kind];
    exercises.push({ ...exercise, prompt: kindPrompt, hint: kindHint, kind });
  }

  // Overlays: the review's own texts in every locale, word translations from the source
  // lessons (a locale the sources miss stays incomplete, and the app shows Russian).
  const texts: Partial<Record<'en' | 'he', LessonTexts>> = {};
  for (const locale of ['en', 'he'] as const) {
    const t = TEXTS[locale];
    texts[locale] = {
      title: t.title,
      presentation: {
        intro: t.intro,
        completionTitle: t.completionTitle,
        completionMessage: t.completionMessage,
      },
      exercises: Object.fromEntries(
        exercises.map((e) => [e.id, { prompt: t.tasks[e.kind][0], hint: t.tasks[e.kind][1] }]),
      ),
      words: Object.fromEntries(
        sources.flatMap(({ lesson, word }) => {
          const translation = lesson.texts?.[locale]?.words?.[word.id]?.translation;
          return translation ? [[word.id, { translation }]] : [];
        }),
      ),
    };
  }
  return {
    schemaVersion: 2,
    id: REVIEW_LESSON_ID,
    version: 1,
    language: sources[0]!.lesson.language,
    title: TEXTS.ru.title,
    presentation: {
      intro: TEXTS.ru.intro,
      completionTitle: TEXTS.ru.completionTitle,
      completionMessage: TEXTS.ru.completionMessage,
    },
    texts,
    words,
    media,
    exercises: exercises.map(({ kind: _kind, ...e }) => e),
  };
}

function shuffle<T>(items: T[], rand: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
