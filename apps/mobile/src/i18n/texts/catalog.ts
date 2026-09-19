import { defineTexts } from '../define';

/* Names of the game's built-in things (quests, trophies, shop goods, bundled mascots), keyed by
   their ids. Russian repeats the originals from learning-core and the bundled catalog. */
export const catalog = defineTexts({
  ru: {
    quests: {
      lesson: 'Пройди 1 урок сегодня',
      words: 'Выучи 5 новых слов сегодня',
      perfect: 'Пройди 2 урока без ошибок',
    },
    trophies: {
      wizard: { title: 'Словесный маг', description: 'Выучено 50 слов' },
      streak: { title: 'Неугомонный', description: 'Серия занятий 7 дней подряд' },
      sniper: { title: 'Супер-снайпер', description: '10 идеальных уроков' },
      owl: { title: 'Ночной знаток', description: 'Заверши урок после 18:00' },
    },
    slots: {
      head: 'Головной убор',
      eyes: 'Очки и маски',
      outfit: 'Одежда',
      back: 'Плащ и спина',
      companion: 'Спутник',
    },
    rarity: { common: 'Обычный', magic: 'Магический', legendary: 'Легендарный' },
    categories: {
      all: 'Все товары',
      clothes: 'Одежда и плащи',
      hats: 'Шляпы и очки',
      companions: 'Спутники',
      boosters: 'Бустеры уроков',
      chests: 'Сундуки удачи',
    },
    weekdays: { mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс' },
    items: {
      freeze: {
        name: 'Заморозка стрика',
        description: 'Сохранит серию занятий, если пропустишь день',
      },
      chest: {
        name: 'Сундук новичка',
        description: 'Случайная вещь из гардероба, которой у тебя ещё нет',
      },
      astronaut: {
        name: 'Космический капитан',
        description: 'Скафандр и сияющий шлем для твоего героя',
      },
      cape: { name: 'Плащ героя', description: 'Красный плащ со звёздной застёжкой' },
      crown: { name: 'Корона слов', description: 'Королевский блеск для знатока слов' },
      glasses: { name: 'Очки профессора', description: 'Золотая оправа для самых любознательных' },
      cap: { name: 'Кепка скаута', description: 'Зелёная кепка со значком следопыта' },
    },
    mascots: {
      fox: {
        name: 'Лисёнок Тим',
        withName: 'Тимом',
        trait: 'Любознательный следопыт',
        perk: 'Радуется каждому новому слову',
      },
      owl: {
        name: 'Совёнок Умка',
        withName: 'Умкой',
        trait: 'Мудрый книгочей',
        perk: 'Любит слушать, как звучат слова',
      },
      bear: {
        name: 'Медвежонок Балу',
        withName: 'Балу',
        trait: 'Отважный путешественник',
        perk: 'Не боится ошибок — и тебе не даст',
      },
      rabbit: {
        name: 'Зайка Луна',
        withName: 'Луной',
        trait: 'Весёлая непоседа',
        perk: 'Заряжает заниматься каждый день',
      },
    },
  },
  en: {
    quests: {
      lesson: 'Finish 1 lesson today',
      words: 'Learn 5 new words today',
      perfect: 'Finish 2 lessons with no mistakes',
    },
    trophies: {
      wizard: { title: 'Word Wizard', description: '50 words learned' },
      streak: { title: 'Unstoppable', description: 'A 7-day learning streak' },
      sniper: { title: 'Super Sniper', description: '10 perfect lessons' },
      owl: { title: 'Night Owl', description: 'Finish a lesson after 6 pm' },
    },
    slots: {
      head: 'Headwear',
      eyes: 'Glasses & masks',
      outfit: 'Clothes',
      back: 'Capes & back',
      companion: 'Companion',
    },
    rarity: { common: 'Common', magic: 'Magic', legendary: 'Legendary' },
    categories: {
      all: 'All items',
      clothes: 'Clothes & capes',
      hats: 'Hats & glasses',
      companions: 'Companions',
      boosters: 'Lesson boosters',
      chests: 'Lucky chests',
    },
    weekdays: { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' },
    items: {
      freeze: { name: 'Streak Freeze', description: 'Keeps your streak if you miss a day' },
      chest: {
        name: 'Starter Chest',
        description: 'A random wardrobe item you don’t have yet',
      },
      astronaut: {
        name: 'Space Captain',
        description: 'A spacesuit and a shining helmet for your hero',
      },
      cape: { name: 'Hero Cape', description: 'A red cape with a star clasp' },
      crown: { name: 'Word Crown', description: 'A royal sparkle for a word expert' },
      glasses: { name: 'Professor’s Glasses', description: 'Golden frames for the most curious' },
      cap: { name: 'Scout Cap', description: 'A green cap with a tracker badge' },
    },
    mascots: {
      fox: {
        name: 'Tim the Fox Cub',
        withName: 'Tim',
        trait: 'Curious tracker',
        perk: 'Loves every new word',
      },
      owl: {
        name: 'Umka the Owlet',
        withName: 'Umka',
        trait: 'Wise bookworm',
        perk: 'Loves listening to how words sound',
      },
      bear: {
        name: 'Balu the Bear Cub',
        withName: 'Balu',
        trait: 'Brave traveler',
        perk: 'Not afraid of mistakes, and you won’t be either',
      },
      rabbit: {
        name: 'Luna the Bunny',
        withName: 'Luna',
        trait: 'Cheerful fidget',
        perk: 'Gets you learning every day',
      },
    },
  },
  he: {
    quests: {
      lesson: 'לסיים שיעור אחד היום',
      words: 'ללמוד 5 מילים חדשות היום',
      perfect: 'לסיים 2 שיעורים בלי טעויות',
    },
    trophies: {
      wizard: { title: 'קוסם המילים', description: '50 מילים נלמדו' },
      streak: { title: 'שיא התמדה', description: 'רצף של 7 ימי לימוד' },
      sniper: { title: 'פגיעה בול', description: '10 שיעורים מושלמים' },
      owl: { title: 'ינשוף לילה', description: 'לסיים שיעור אחרי 18:00' },
    },
    slots: {
      head: 'כיסוי ראש',
      eyes: 'משקפיים ומסכות',
      outfit: 'בגדים',
      back: 'גלימות וגב',
      companion: 'חבר למסע',
    },
    rarity: { common: 'רגיל', magic: 'קסום', legendary: 'אגדי' },
    categories: {
      all: 'כל הפריטים',
      clothes: 'בגדים וגלימות',
      hats: 'כובעים ומשקפיים',
      companions: 'חברים למסע',
      boosters: 'בוסטרים לשיעורים',
      chests: 'תיבות מזל',
    },
    weekdays: { mon: 'ב׳', tue: 'ג׳', wed: 'ד׳', thu: 'ה׳', fri: 'ו׳', sat: 'ש׳', sun: 'א׳' },
    items: {
      freeze: { name: 'הקפאת רצף', description: 'שומרת על הרצף אם מפספסים יום' },
      chest: { name: 'תיבת מתחילים', description: 'פריט אקראי מהמלתחה שעוד אין לך' },
      astronaut: { name: 'קפטן חלל', description: 'חליפת חלל וקסדה נוצצת לגיבור שלך' },
      cape: { name: 'גלימת גיבור', description: 'גלימה אדומה עם סיכת כוכב' },
      crown: { name: 'כתר המילים', description: 'ברק מלכותי למומחי מילים' },
      glasses: { name: 'משקפי פרופסור', description: 'מסגרת זהב לסקרנים במיוחד' },
      cap: { name: 'כובע צופים', description: 'כובע ירוק עם סמל של גשש' },
    },
    mascots: {
      fox: {
        name: 'השועלון טים',
        withName: 'טים',
        trait: 'גשש סקרן',
        perk: 'שמח בכל מילה חדשה',
      },
      owl: {
        name: 'הינשופון אומקה',
        withName: 'אומקה',
        trait: 'תולעת ספרים חכמה',
        perk: 'אוהב להקשיב לצלילי המילים',
      },
      bear: {
        name: 'הדובון באלו',
        withName: 'באלו',
        trait: 'מטייל אמיץ',
        perk: 'לא מפחד מטעויות, וגם לך לא ייתן לפחד',
      },
      rabbit: {
        name: 'הארנבונת לונה',
        withName: 'לונה',
        trait: 'שובבה עליזה',
        perk: 'נותנת כוח ללמוד כל יום',
      },
    },
  },
});
