import test from 'node:test';
import assert from 'node:assert/strict';
import { generationInputSchema } from '@lingvohero/contracts';
import { distribute, wordCountFor } from './distribute.js';
import { estimate } from './estimate.js';

test('distributes exercises without a one-exercise tail and within lesson limits', () => {
  assert.deepEqual(distribute(24, 6), [6, 6, 6, 6]);
  assert.deepEqual(distribute(25, 6), [6, 6, 6, 7]);
  assert.deepEqual(distribute(29, 6), [7, 7, 7, 8]);
  assert.deepEqual(distribute(6, 6), [6]);
  assert.deepEqual(distribute(7, 6), [7]);
  assert.deepEqual(distribute(6, 8), [6]);
  assert.deepEqual(distribute(60, 30), [30, 30]);
  assert.deepEqual(distribute(60, 40), [30, 30]);
  assert.deepEqual(distribute(31, 40), [15, 16]);
  for (let total = 6; total <= 60; total += 1)
    for (const size of [3, 4, 6, 8, 12]) {
      const parts = distribute(total, size);
      assert.equal(
        parts.reduce((a, b) => a + b, 0),
        total,
      );
      assert.ok(parts.every((p) => p >= 2 && p <= 30));
    }
  assert.throws(() => distribute(0, 6));
});

test('word count and cost estimate scale with the request', () => {
  assert.equal(wordCountFor([6, 6], 0), 8);
  assert.equal(wordCountFor([6], 0), 4);
  assert.equal(wordCountFor([6], 10), 10);
  assert.equal(wordCountFor(Array(12).fill(5), 0), 40);
  assert.equal(wordCountFor([6, 6], 0, { wordsPerLesson: 6 }), 12);
  assert.equal(wordCountFor([6, 6], 0, { requested: 5 }), 5);
  assert.equal(wordCountFor([6, 6], 7, { requested: 5 }), 7);
  assert.equal(wordCountFor([6, 6, 6, 6], 0, { requested: 3 }), 5); // lessons + 1
  assert.equal(wordCountFor([6], 0, { requested: 99 }), 40);
  // Target words define the vocabulary instead of being padded with off-topic words.
  assert.equal(wordCountFor([6, 6, 6, 6], 10), 10);
  assert.equal(wordCountFor([6, 6, 6, 6], 2), 16); // too few to fill the lessons: topic words
  const input = generationInputSchema.parse({ topic: 'Зоопарк', totalExercises: 25 });
  const result = estimate(input, {
    imageUsd: 0.04,
    ttsPer1kCharsUsd: 0.015,
    textPer1kTokensUsd: 0.01,
  });
  assert.deepEqual(result.distribution, [6, 6, 6, 7]);
  assert.equal(result.words, 16);
  assert.equal(result.images, 17);
  assert.equal(result.audios, 16);
  assert.ok(result.estimatedUsd > 0.6 && result.estimatedUsd < 1);
  const explicit = estimate(
    generationInputSchema.parse({ topic: 'Зоопарк', totalExercises: 25, wordCount: 20 }),
    { imageUsd: 0.04, ttsPer1kCharsUsd: 0.015, textPer1kTokensUsd: 0.01 },
  );
  assert.equal(explicit.words, 20);
  assert.equal(explicit.images, 21);
});
