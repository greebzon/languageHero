import { z } from 'zod';
export * from './course';
export * from './admin';
export * from './shop';
export * from './locales';

export const choiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  translation: z.string().min(1),
  imageId: z.string().min(1),
});

export const exerciseSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('listen-and-select'),
    prompt: z.string(),
    audioId: z.string().min(1),
    hint: z.string().min(1),
    choices: z.array(choiceSchema).min(2),
    correctChoiceId: z.string().min(1),
  })
  .superRefine((exercise, context) => {
    if (new Set(exercise.choices.map((choice) => choice.id)).size !== exercise.choices.length) {
      context.addIssue({ code: 'custom', message: 'Choice IDs must be unique' });
    }
    if (!exercise.choices.some((choice) => choice.id === exercise.correctChoiceId)) {
      context.addIssue({ code: 'custom', message: 'Correct choice must exist' });
    }
  });

// Answer keys are only for an authorized offline package or the bundled demo.
// This shape must never become a public catalog response.
export const lessonPackageSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    version: z.number().int().positive(),
    language: z.string().min(2),
    title: z.string(),
    exercises: z.array(exerciseSchema).min(1),
  })
  .superRefine((lesson, context) => {
    if (new Set(lesson.exercises.map((exercise) => exercise.id)).size !== lesson.exercises.length) {
      context.addIssue({ code: 'custom', message: 'Exercise IDs must be unique' });
    }
  });

export const demoStateSchema = z.object({
  version: z.literal(1),
  soundEnabled: z.boolean(),
  completed: z.boolean(),
  bestStars: z.number().int().min(0).max(3),
  session: z
    .object({
      lessonId: z.string(),
      contentVersion: z.number().int(),
      exerciseIndex: z.number().int().min(0),
      mistakes: z.number().int().min(0),
      correct: z.boolean(),
      finished: z.boolean(),
    })
    .nullable(),
});

export type LessonPackage = z.infer<typeof lessonPackageSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type Choice = z.infer<typeof choiceSchema>;
export type DemoState = z.infer<typeof demoStateSchema>;
export * from './account';
