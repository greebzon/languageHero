import { defineTexts } from '../define';

/* The lesson result screen. */
export const result = defineTexts({
  ru: {
    passed: '{title} — ПРОЙДЕНО',
    title: 'Ты — друг леса!',
    message: 'Слова становятся знакомее с каждой игрой.\nОтличная работа!',
    xp: 'опыта всего',
    words: 'слов в уроке',
    coins: 'монет всего',
    saveFailed: 'Не удалось сохранить прогресс на устройстве',
    saved: 'Прогресс сохраняется на устройстве',
    repeat: 'Повторить слова',
    repeatNote: 'Повторение помогает запомнить слова.\nМонеты за этот урок начисляются один раз.',
  },
  en: {
    passed: '{title} — DONE',
    title: 'You’re a friend of the forest!',
    message: 'Words get more familiar with every game.\nGreat work!',
    xp: 'XP in total',
    words: 'words in the lesson',
    coins: 'coins in total',
    saveFailed: 'Couldn’t save progress on this device',
    saved: 'Progress is saved on this device',
    repeat: 'Practice the words again',
    repeatNote: 'Practice helps you remember words.\nCoins for this lesson are given only once.',
  },
  he: {
    passed: '{title} — הושלם',
    title: 'כל היער חוגג!',
    message: 'המילים נעשות מוכרות יותר בכל משחק.\nכל הכבוד!',
    xp: 'נקודות ניסיון',
    words: 'מילים בשיעור',
    coins: 'מטבעות בסך הכול',
    saveFailed: 'לא הצלחנו לשמור את ההתקדמות במכשיר',
    saved: 'ההתקדמות נשמרת במכשיר',
    repeat: 'לחזור על המילים',
    repeatNote: 'חזרה עוזרת לזכור מילים.\nמטבעות על השיעור הזה מקבלים רק פעם אחת.',
  },
});
