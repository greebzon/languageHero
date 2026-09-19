import type { GenerationInput, GenerationWord, Locale } from '@lingvohero/contracts';

/** Bump when a prompt changes: artifacts are keyed by it, so old outputs are never reused. */
export const PROMPT_VERSION = 'v3';

/* Children of any gender read these texts: Russian past-tense verbs and short adjectives mark
   gender («ты собрал», «ты готов»), so the model is told to avoid them. */
const NEUTRAL_RUSSIAN =
  'Address the child as «ты» in gender-neutral Russian: never use past-tense verbs or short adjectives that mark gender (not «ты собрал», «ты запомнил», «ты узнал», «ты готов»); use present or future tense, «у тебя получилось», «ты умеешь», «готово», «отлично» instead.';

const mixLabels: Record<GenerationInput['mix'][number], string> = {
  'listen-and-select': 'listen-and-select (hear a word, pick its picture among 2–4 options)',
  'match-pairs': 'match-pairs (connect 2–4 words with their pictures)',
  'build-word': 'build-word (spell a word from letter tiles with a few distractor letters)',
};

export type PlanPayload = {
  language: string;
  languageTitle: string;
  topic: string;
  distribution: number[];
  wordCount: number;
  targetWords: string[];
  existingWords: string[];
  level: string;
  ageRange: string;
  style: string | null;
};

export function planPrompt(payload: PlanPayload) {
  const system = `You design short game lessons that teach ${payload.languageTitle} (${payload.language}) vocabulary to Russian-speaking children aged ${payload.ageRange}, level ${payload.level}. Explanations, hints, titles and translations are in Russian; the target words and speech texts are in ${payload.languageTitle}. Keep everything gentle, concrete and playful. Never include violence, fear, brands or text inside images. ${NEUTRAL_RUSSIAN} Answer strictly in the requested JSON schema.`;
  const user = [
    `Topic: "${payload.topic}".`,
    `Create exactly ${payload.wordCount} vocabulary words (nouns or simple adjectives a child can picture), each with:`,
    `- key: short lowercase latin identifier (a-z, digits, dashes), unique;`,
    `- text: the word as shown to the child (may include an article, e.g. "A fox");`,
    `- spelling: the bare word in lowercase letters only, max 12 characters, no spaces (used for letter tiles);`,
    `- translation: Russian translation;`,
    `- imagePrompt: an English description of one friendly, clear illustration of this word alone on a plain background;`,
    `- speechText: exactly the text a narrator says (usually the same as text).`,
    payload.targetWords.length
      ? payload.targetWords.length >= payload.wordCount
        ? `The vocabulary is exactly these words and no others: ${payload.targetWords.join(', ')}.`
        : `These words must be included: ${payload.targetWords.join(', ')}. The other words stay strictly on the topic.`
      : '',
    payload.existingWords.length
      ? `Avoid these words, they already exist in the course: ${payload.existingWords.join(', ')}.`
      : '',
    `Then plan exactly ${payload.distribution.length} lessons; lesson i has ${payload.distribution.join(', ')} exercises respectively. Each lesson: a short Russian title (max 40 chars), a one-sentence learning goal in Russian, an intro line Тим the fox says at the start (Russian, max 200 chars), a completion title (Russian, max 60 chars), a completion message (Russian, max 300 chars) and wordKeys — 2 to 6 keys from the vocabulary it practices. Lessons must have different goals and their wordKeys must not be identical sets. Every vocabulary word must appear in at least one lesson.`,
    payload.style ? `Illustration style brief: ${payload.style}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export type LessonPayload = {
  language: string;
  languageTitle: string;
  topic: string;
  lesson: { title: string; goal: string; wordKeys: string[] };
  words: GenerationWord[];
  exerciseCount: number;
  mix: GenerationInput['mix'];
  feedback: string | null;
};

export function lessonPrompt(payload: LessonPayload) {
  const system = `You write exercises for a children's ${payload.languageTitle} learning game (Russian-speaking children aged 6–9). Instructions and hints are short Russian sentences a child can read. ${NEUTRAL_RUSSIAN} Answer strictly in the requested JSON schema.`;
  const vocabulary = payload.words
    .filter((w) => payload.lesson.wordKeys.includes(w.key))
    .map((w) => `- ${w.key}: "${w.text}" (${w.translation}), spelling "${w.spelling}"`)
    .join('\n');
  const user = [
    `Lesson "${payload.lesson.title}" — goal: ${payload.lesson.goal}. Topic: ${payload.topic}.`,
    `Available words (use only these keys):\n${vocabulary}`,
    `Produce exactly ${payload.exerciseCount} exercises using only these mechanics: ${payload.mix.map((m) => mixLabels[m]).join('; ')}. Use every allowed mechanic at least once when the count allows, alternate them, and practise every word of the lesson at least once.`,
    `Field rules per type:`,
    `- listen-and-select: wordKey = the correct word; choiceKeys = 2–4 distinct keys including wordKey (order is the display order); pairKeys = []; distractorLetters = "".`,
    `- match-pairs: wordKey = ""; pairKeys = 2–4 distinct keys; choiceKeys = []; distractorLetters = "".`,
    `- build-word: wordKey = the word to spell; distractorLetters = 1–3 extra lowercase letters not helping to spell it; choiceKeys = []; pairKeys = [].`,
    `prompt: what the child must do (Russian, max 120 chars, no answer inside). hint: a friendly clue from Тим the fox (Russian, max 200 chars) that does not spell out the word.`,
    payload.feedback
      ? `The previous attempt was rejected: ${payload.feedback}. Fix exactly that.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

export const styleBrief = (style: string | null) =>
  style ??
  'soft, rounded children-book illustration, warm colours, gentle lighting, no text, no letters, no logos';

export const coverPrompt = (topic: string, style: string | null) =>
  `A cheerful cover illustration for a children's language-learning adventure about "${topic}". Wide landscape scene with a small friendly orange fox cub named Tim wearing round glasses and teal headphones, exploring the scene. ${styleBrief(style)}. Absolutely no text or letters in the image.`;

export const imagePrompt = (word: GenerationWord, style: string | null) =>
  `${word.imagePrompt}. Single subject, centred, plain light background, ${styleBrief(style)}. Absolutely no text or letters in the image.`;

export const speechInstructions = (languageTitle: string) =>
  `Speak in ${languageTitle}, slowly and clearly, warm and friendly, as if talking to a six-year-old child. Pronounce the word once, without adding anything.`;

export type TranslationPayload = {
  sourceLanguage: string;
  sourceLanguageTitle: string;
  language: string;
  languageTitle: string;
  words: { key: string; text: string; spelling: string; translation: string }[];
  lessons: {
    title: string;
    intro: string | null;
    completionTitle: string | null;
    completionMessage: string | null;
  }[];
};

export function translationPrompt(payload: TranslationPayload) {
  const system = `You localise a children's vocabulary game (Russian-speaking children aged 6–9) from ${payload.sourceLanguageTitle} (${payload.sourceLanguage}) to ${payload.languageTitle} (${payload.language}). The pictures stay the same, so every word must keep exactly its meaning. Russian texts stay in Russian. ${NEUTRAL_RUSSIAN} Answer strictly in the requested JSON schema.`;
  const words = payload.words
    .map((w) => `- ${w.key}: "${w.text}" (Russian: ${w.translation})`)
    .join('\n');
  const lessons = payload.lessons
    .map(
      (l, i) =>
        `${i + 1}. title: ${l.title}; intro: ${l.intro ?? '—'}; completionTitle: ${l.completionTitle ?? '—'}; completionMessage: ${l.completionMessage ?? '—'}`,
    )
    .join('\n');
  const user = [
    `Words to translate into ${payload.languageTitle} (keep every key):\n${words}`,
    `For each word return: key (unchanged); text — the word as shown to the child in ${payload.languageTitle} (with an article if that language naturally uses one); spelling — the bare word only, lowercase, letters only, no spaces, no vowel marks or diacritics that are not normally written, max 12 characters, used for letter tiles; speechText — exactly what a narrator says in ${payload.languageTitle}.`,
    `Then return the ${payload.lessons.length} lessons in the same order. Keep them in Russian, keep their meaning and length; only replace mentions of the ${payload.sourceLanguageTitle} language or ${payload.sourceLanguageTitle} words with ${payload.languageTitle} ones. For a field shown as "—" return an empty string.\n${lessons}`,
  ].join('\n');
  return { system, user };
}

export type LessonTranslationPayload = {
  sourceLanguageTitle: string;
  languageTitle: string;
  lessonTitle: string;
  words: { key: string; sourceText: string; text: string; translation: string }[];
  exercises: { type: string; prompt: string; hint: string; words: string[] }[];
};

export function lessonTranslationPrompt(payload: LessonTranslationPayload) {
  const system = `You adapt exercise texts of a children's vocabulary game (Russian-speaking children aged 6–9) after the target language changed from ${payload.sourceLanguageTitle} to ${payload.languageTitle}. Texts stay in Russian, short and friendly. ${NEUTRAL_RUSSIAN} Answer strictly in the requested JSON schema.`;
  const words = payload.words
    .map((w) => `- ${w.key}: was "${w.sourceText}", now "${w.text}" (${w.translation})`)
    .join('\n');
  const exercises = payload.exercises
    .map(
      (e, i) =>
        `${i + 1}. [${e.type}; words: ${e.words.join(', ')}] prompt: ${e.prompt} | hint: ${e.hint}`,
    )
    .join('\n');
  const user = [
    `Lesson "${payload.lessonTitle}". Words:\n${words}`,
    `Return exactly ${payload.exercises.length} exercises in the same order. For each: prompt and hint rewritten in Russian with any ${payload.sourceLanguageTitle} word or letter replaced by the ${payload.languageTitle} one (a hint must not spell out the answer); distractorLetters — for build-word 1–2 lowercase ${payload.languageTitle} letters that are not in the word, otherwise an empty string.\n${exercises}`,
  ].join('\n');
  return { system, user };
}

/* --- Interface translations of a lesson (texts job) ----------------------------------------- */

const LOCALE_NAMES: Record<Locale, string> = { ru: 'Russian', en: 'English', he: 'Hebrew' };
const LOCALE_RULES: Partial<Record<Locale, string>> = {
  en: 'English: simple words a 6-year-old reads, second person ("you"), no gendered forms.',
  he: "Hebrew: modern everyday Hebrew without niqqud (vowel points), short sentences a 6-year-old can read; the child may be a boy or a girl, so prefer gender-neutral forms (infinitive instructions such as «לבחור», «להקשיב», or plural/first-person-plural «בואו נ...») and never assume the child's gender.",
};

export type LessonTextsPayload = {
  learningLanguageTitle: string;
  locales: Locale[];
  lesson: {
    title: string;
    presentation: { intro: string; completionTitle: string; completionMessage: string } | null;
    words: { id: string; text: string; translation: string }[];
    exercises: { id: string; type: string; prompt: string; hint: string }[];
  };
};

/**
 * One call per lesson for all target locales: the texts a child reads around the words
 * (title, Tim's lines, prompts, hints) and the meaning of each word, from Russian.
 */
export function lessonTextsPrompt(payload: LessonTextsPayload) {
  const system = `You localise a children's game that teaches ${payload.learningLanguageTitle} words to children aged 6–9. You translate the game's own texts from Russian into the children's interface languages. The ${payload.learningLanguageTitle} words themselves are what the child learns: never translate, change or add them inside prompts and hints — keep them exactly as written. Keep Тим the fox as the speaker (Tim in English, טים in Hebrew). Keep the meaning, tone and length; a hint still must not give away the answer. ${payload.locales
    .map((l) => LOCALE_RULES[l])
    .filter(Boolean)
    .join(' ')} Answer strictly in the requested JSON schema.`;
  const l = payload.lesson;
  const user = [
    `Target languages: ${payload.locales.map((x) => `${x} (${LOCALE_NAMES[x]})`).join(', ')}. Return one entry per target language.`,
    `Lesson title: ${l.title}`,
    l.presentation
      ? `Tim's intro: ${l.presentation.intro}\nCompletion title: ${l.presentation.completionTitle}\nCompletion message: ${l.presentation.completionMessage}`
      : 'The lesson has no intro/completion lines: return presentation as null.',
    `Words (translate the meaning, i.e. the Russian translation, into each target language; the ${payload.learningLanguageTitle} word is given for context):\n${l.words
      .map((w) => `- ${w.id}: ${w.text} = ${w.translation}`)
      .join('\n')}`,
    `Exercises (keep every id):\n${l.exercises
      .map((e) => `- ${e.id} [${e.type}] prompt: ${e.prompt} | hint: ${e.hint}`)
      .join('\n')}`,
  ].join('\n');
  return { system, user };
}

export type WardrobeTextsPayload = {
  locales: Locale[];
  kind: 'mascot' | 'item';
  /* Mascot: name, withName (the name after «вместе с», in the instrumental case), trait, perk.
     Item: name, description. */
  fields: Record<string, string>;
};
export function wardrobeTextsPrompt(payload: WardrobeTextsPayload) {
  const system = `You localise a children's language-learning game (children aged 6–9) from Russian. ${
    payload.kind === 'mascot'
      ? 'This is a mascot: a friendly animal character who learns with the child. Translate the name as a name, keeping the character’s own name recognisable (transliterate it, and use this mascot’s own name, not another one): «<Name> the <animal>» in English, «ה<animal> <Name>» in Hebrew. The trait and perk describe the mascot itself in the third person and the character’s own grammatical gender, never the child: «Радуется каждому новому слову» → «Cheers for every new word», not «You cheer».'
      : 'This is a wearable item in the game shop. Keep the name short and fun. The description describes the item itself as a short phrase like the original, without addressing the child (no «you wear»): «Красный плащ со звёздной застёжкой» → «A red cape with a star clasp».'
  } ${payload.locales
    .map((l) => LOCALE_RULES[l])
    .filter(Boolean)
    .join(' ')} Answer strictly in the requested JSON schema.`;
  const user = [
    `Target languages: ${payload.locales.map((x) => `${x} (${LOCALE_NAMES[x]})`).join(', ')}. Return one entry per target language.`,
    ...Object.entries(payload.fields).map(([k, v]) =>
      k === 'withName'
        ? `withName (the name as it follows «вместе с» — in the target language give the plain short name used after "with" / "עם"): ${v}`
        : `${k}: ${v}`,
    ),
  ].join('\n');
  return { system, user };
}

export type CourseTextsPayload = {
  locales: Locale[];
  title: string;
  description: string | null;
  languageTitle: string;
};

/** A set's card (title, description) and the learning language's name, from Russian. */
export function courseTextsPrompt(payload: CourseTextsPayload) {
  const system = `You localise a children's language-learning game (children aged 6–9) from Russian. Keep titles short and playful, the same length as the original. ${payload.locales
    .map((l) => LOCALE_RULES[l])
    .filter(Boolean)
    .join(' ')} Answer strictly in the requested JSON schema.`;
  const user = [
    `Target languages: ${payload.locales.map((x) => `${x} (${LOCALE_NAMES[x]})`).join(', ')}. Return one entry per target language.`,
    `Set title: ${payload.title}`,
    `Set description: ${payload.description ?? '— (return null)'}`,
    `Name of the language the child learns (as a language name, e.g. «Английский» → English / אנגלית): ${payload.languageTitle}`,
  ].join('\n');
  return { system, user };
}
