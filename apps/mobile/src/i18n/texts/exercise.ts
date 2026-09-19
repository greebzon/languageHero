import { defineTexts } from '../define';

/* The three exercise mechanics (the words themselves come from the lesson, untranslated). */
export const exercise = defineTexts({
  ru: {
    listen: 'Послушай слово и выбери картинку.',
    pairs: 'Сначала слово, потом картинка. Номера покажут твои пары.',
    pairWord: 'Слово {word}',
    pairImage: 'Картинка: {translation}',
    resetPairs: 'Сбросить пары',
    build: 'Собери слово. Нажми на буквы по порядку.',
    built: 'Собранное слово',
    placeholder: 'Здесь появится слово',
    removeLetter: 'Убрать букву {letter}, позиция {position}',
    letter: 'Буква {letter}',
    restart: 'Начать слово заново',
  },
  en: {
    listen: 'Listen to the word and pick the picture.',
    pairs: 'First a word, then a picture. The numbers show your pairs.',
    pairWord: 'Word {word}',
    pairImage: 'Picture: {translation}',
    resetPairs: 'Clear the pairs',
    build: 'Build the word. Tap the letters in order.',
    built: 'Your word',
    placeholder: 'The word will appear here',
    removeLetter: 'Remove letter {letter}, position {position}',
    letter: 'Letter {letter}',
    restart: 'Start the word again',
  },
  he: {
    listen: 'מקשיבים למילה ובוחרים תמונה.',
    pairs: 'קודם מילה, אחר כך תמונה. המספרים יראו את הזוגות.',
    pairWord: 'המילה {word}',
    pairImage: 'תמונה: {translation}',
    resetPairs: 'לנקות את הזוגות',
    build: 'מרכיבים את המילה. לוחצים על האותיות לפי הסדר.',
    built: 'המילה שהורכבה',
    placeholder: 'כאן תופיע המילה',
    removeLetter: 'להסיר את האות {letter}, מקום {position}',
    letter: 'האות {letter}',
    restart: 'להתחיל את המילה מחדש',
  },
});
