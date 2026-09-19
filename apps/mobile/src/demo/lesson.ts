import { lessonPackageSchema, type Choice } from '@lingvohero/contracts';

export const animals: Choice[] = [
  { id: 'fox', label: 'A fox', translation: 'Лисёнок', imageId: 'fox' },
  { id: 'bear', label: 'A bear', translation: 'Медвежонок', imageId: 'bear' },
  { id: 'rabbit', label: 'A rabbit', translation: 'Зайчик', imageId: 'rabbit' },
  { id: 'owl', label: 'An owl', translation: 'Совёнок', imageId: 'owl' },
];

const hints: Record<string, string> = {
  fox: 'У этого зверька рыжая шубка и пушистый хвост.',
  bear: 'Большой лесной сладкоежка с круглыми ушами.',
  rabbit: 'У этого зверька длинные ушки. Он умеет прыгать!',
  owl: 'Эта птица с большими глазами не спит по ночам.',
};

export const demoLesson = lessonPackageSchema.parse({
  schemaVersion: 1,
  id: 'en-animals-01',
  version: 1,
  language: 'en',
  title: 'Лесные друзья',
  exercises: ['fox', 'bear', 'rabbit', 'owl', 'bear', 'fox'].map((animal, index) => ({
    id: `animals-${index + 1}`,
    type: 'listen-and-select',
    prompt: 'Послушай и найди зверька',
    audioId: animal,
    hint: hints[animal],
    choices: [...animals.slice(index % 4), ...animals.slice(0, index % 4)],
    correctChoiceId: animal,
  })),
});

export const audioAssets: Record<string, number> = {
  fox: require('../../assets/audio/fox.wav'),
  bear: require('../../assets/audio/bear.wav'),
  rabbit: require('../../assets/audio/rabbit.wav'),
  owl: require('../../assets/audio/owl.wav'),
};
