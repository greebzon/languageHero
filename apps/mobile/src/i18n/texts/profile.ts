import { defineTexts } from '../define';

/* The profile tab. */
export const profile = defineTexts({
  ru: {
    level: 'УРОВЕНЬ {level}',
    subtitle: '{language} вместе с {mascot}',
    wardrobe: 'Примерочная',
    xp: '{xp} XP · следующий уровень: {next} XP',
    levelNote: 'Уровень обновляется после сохранения результатов на сервере.',
    comfort: 'Удобно тебе',
    sound: 'Звук',
    soundHint: 'Произношение слов',
    offline: 'Урок всегда с тобой',
    offlineHint: 'Начальная тема входит в приложение. Открытый урок загружается вместе с озвучкой.',
    version: 'Версия {version}',
    motto: 'Создано для маленьких открытий',
  },
  en: {
    level: 'LEVEL {level}',
    subtitle: '{language} with {mascot}',
    wardrobe: 'Fitting room',
    xp: '{xp} XP · next level: {next} XP',
    levelNote: 'Your level updates after your results are saved on the server.',
    comfort: 'Your settings',
    sound: 'Sound',
    soundHint: 'How words sound',
    offline: 'Lessons go with you',
    offlineHint:
      'The first topic comes with the app. An opened lesson downloads together with its sounds.',
    version: 'Version {version}',
    motto: 'Made for little discoveries',
  },
  he: {
    level: 'שלב {level}',
    subtitle: '{language} עם {mascot}',
    wardrobe: 'חדר הלבשה',
    xp: '{xp} XP · השלב הבא: {next} XP',
    levelNote: 'השלב מתעדכן אחרי שהתוצאות נשמרות בשרת.',
    comfort: 'ההגדרות שלך',
    sound: 'צליל',
    soundHint: 'הגייה של מילים',
    offline: 'השיעור תמיד זמין',
    offlineHint: 'הנושא הראשון כלול באפליקציה. שיעור שנפתח נטען יחד עם ההקלטות.',
    version: 'גרסה {version}',
    motto: 'נוצר בשביל תגליות קטנות',
  },
});
