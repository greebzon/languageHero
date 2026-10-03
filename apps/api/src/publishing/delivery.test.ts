import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BuildInput } from './build-release.js';
import { deliveryBoxes } from './plan.js';

const course = (id: string, visibility: string, coverAssetId: string | null) =>
  ({ id, visibility, coverAssetId }) as unknown as BuildInput['courses'][number];
const lesson = (courseId: string, media: object[]) =>
  ({
    courseId,
    document: { words: [], exercises: [], media },
  }) as unknown as BuildInput['lessons'][number];

test('deliveryBoxes: covers, one word per atlas cell, the larger box for shared files', () => {
  const boxes = deliveryBoxes({
    courses: [
      course('live', 'published', 'cover-a'),
      course('soon', 'preview', 'cover-b'),
      course('draft', 'draft', 'cover-c'),
    ],
    lessons: [
      lesson('live', [
        { id: 'w', kind: 'image', assetId: 'word' },
        {
          id: 'a',
          kind: 'image',
          assetId: 'atlas',
          region: { columns: 3, rows: 2, column: 0, row: 1 },
        },
        { id: 's', kind: 'audio', assetId: 'sound' },
        { id: 'c', kind: 'image', assetId: 'cover-a' },
      ]),
      lesson('draft', [{ id: 'x', kind: 'image', assetId: 'hidden' }]),
    ],
  });
  assert.deepEqual(Object.fromEntries(boxes), {
    'cover-a': { width: 1024, height: 1024 },
    'cover-b': { width: 1024, height: 1024 },
    word: { width: 384, height: 384 },
    atlas: { width: 1152, height: 768 },
  });
});
