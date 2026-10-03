import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import {
  catalogSchema,
  courseLessonSchema,
  releaseSchema,
  type Catalog,
  type CourseLesson,
} from '@lingvohero/contracts';
import seedData from '../../../../content/seed.json';

export const seed = releaseSchema.parse(seedData);
export const apiUrl = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001')
).replace(/\/$/, '');
// A release build talks to the server only over TLS: sign-in codes and cookies travel there.
if (!__DEV__ && !apiUrl.startsWith('https://'))
  throw new Error(`EXPO_PUBLIC_API_URL must be an https address in release builds: ${apiUrl}`);
const builtins = new Map<string, number>();
const audio: Record<string, number> = {
  fox: require('../../assets/audio/fox.wav'),
  bear: require('../../assets/audio/bear.wav'),
  rabbit: require('../../assets/audio/rabbit.wav'),
  owl: require('../../assets/audio/owl.wav'),
};
for (const asset of seed.lessons[0].media)
  builtins.set(
    asset.path,
    asset.kind === 'image'
      ? require('../../assets/images/animals.png')
      : audio[asset.id.replace('-audio', '')],
  );
const prepared = new Map<string, string | number>();
const forestCover = seed.catalog.courses.find((course) => course.id === 'en-forest')?.cover;
if (forestCover) builtins.set(forestCover.path, require('../../assets/images/worlds/forest.png'));
for (const preview of seed.catalog.previews ?? []) {
  const source =
    preview.id === 'en-underwater'
      ? require('../../assets/images/worlds/underwater.png')
      : preview.id === 'en-space'
        ? require('../../assets/images/worlds/space.png')
        : undefined;
  if (source) builtins.set(preview.cover.path, source);
}
export function coverSource(path: string) {
  const source = builtins.get(path);
  return source ?? { uri: `${apiUrl}${path}` };
}
async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}
export async function fetchCatalog(): Promise<Catalog> {
  return catalogSchema.parse(
    await (await fetchWithTimeout(`${apiUrl}/v1/catalog?schemaVersion=2`)).json(),
  );
}
export async function fetchLesson(
  ref: Catalog['courses'][number]['lessons'][number],
  language: string,
) {
  const lesson = courseLessonSchema.parse(
    await (await fetchWithTimeout(`${apiUrl}/v1/lessons/${ref.id}/versions/${ref.version}`)).json(),
  );
  if (
    lesson.id !== ref.id ||
    lesson.version !== ref.version ||
    lesson.language !== language ||
    lesson.title !== ref.title ||
    lesson.exercises.length !== ref.exerciseCount ||
    JSON.stringify([...new Set(lesson.exercises.map((e) => e.type))].sort()) !==
      JSON.stringify([...ref.requiredTypes].sort())
  )
    throw new Error('Package does not match catalog');
  return lesson;
}
export function mediaSource(lesson: CourseLesson, id: string): string | number {
  const media = lesson.media.find((m) => m.id === id);
  if (!media) throw new Error(`Missing media: ${id}`);
  return prepared.get(media.path) ?? builtins.get(media.path) ?? `${apiUrl}${media.path}`;
}
export async function prepareLesson(lesson: CourseLesson) {
  await Promise.all(
    [...new Set(lesson.media.map((m) => m.path))].map(async (path) => {
      if (prepared.has(path)) return;
      const source = builtins.get(path) ?? `${apiUrl}${path}`;
      // Web image requires are { uri, width, height }; native requires are numeric IDs.
      const asset = Asset.fromModule(source);
      if (Platform.OS === 'web') {
        const blob = await (await fetchWithTimeout(asset.uri)).blob();
        prepared.set(path, URL.createObjectURL(blob));
      } else {
        await asset.downloadAsync();
        prepared.set(path, asset.localUri ?? asset.uri);
      }
    }),
  );
}
export const packageKey = (lesson: { id: string; version: number }) =>
  `${lesson.id}@${lesson.version}`;
