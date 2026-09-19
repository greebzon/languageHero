import { defineTexts } from '../define';

/* Word pronunciation buttons. */
export const audio = defineTexts({
  ru: {
    listenTo: 'Послушать {word}',
    listen: 'Слушать',
    playWord: 'Послушать слово',
    listening: 'СЛУШАЙ ВНИМАТЕЛЬНО',
    question: 'КАКОЕ СЛОВО ПРОЗВУЧАЛО?',
    reload: 'Загрузить звук снова',
    enable: 'Включить и слушать',
    playing: 'Слушаем…',
    tap: 'Нажми и послушай',
    slow: 'Медленное произношение',
    error: 'Не получилось открыть звук. Нажми ещё раз для загрузки.',
  },
  en: {
    listenTo: 'Listen to {word}',
    listen: 'Listen',
    playWord: 'Listen to the word',
    listening: 'LISTEN CAREFULLY',
    question: 'WHICH WORD DO YOU HEAR?',
    reload: 'Load the sound again',
    enable: 'Turn on sound and listen',
    playing: 'Listening…',
    tap: 'Tap to listen',
    slow: 'Slow speech',
    error: 'Couldn’t open the sound. Tap again to load it.',
  },
  he: {
    listenTo: 'להקשיב: {word}',
    listen: 'להקשיב',
    playWord: 'להקשיב למילה',
    listening: 'מקשיבים היטב',
    question: 'איזו מילה שומעים?',
    reload: 'לטעון את הצליל שוב',
    enable: 'להפעיל ולהקשיב',
    playing: 'מקשיבים…',
    tap: 'ללחוץ ולהקשיב',
    slow: 'הגייה איטית',
    error: 'לא הצלחנו לפתוח את הצליל. אפשר ללחוץ שוב כדי לטעון.',
  },
});
