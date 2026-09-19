import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultContentRoot } from '../content.js';
import { fakeWav } from '../generation/fake-media.js';
import { inspectMedia, wavPeak } from './media.js';

test('inspects real PNG and WAV files by content', async () => {
  const dir = join(defaultContentRoot, 'media');
  for (const name of await readdir(dir)) {
    const info = inspectMedia(await readFile(join(dir, name)));
    assert.equal(`${info.sha256}.${info.ext}`, name);
    if (info.kind === 'image') assert.ok(info.width! > 0 && info.height! > 0);
    else assert.ok(info.durationMs! > 0);
  }
});

test('rejects other formats and mislabeled files', () => {
  assert.throws(() => inspectMedia(Buffer.from('ffd8ffe000104a464946', 'hex')), /PNG и WAV/);
  assert.throws(() => inspectMedia(Buffer.alloc(0)), /PNG и WAV/);
  const truncatedPng = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.throws(() => inspectMedia(truncatedPng), /PNG/);
  const wavWithoutData = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
  assert.throws(() => inspectMedia(wavWithoutData), /WAV/);
});

test('wavPeak tells real speech from a silent file', () => {
  const speech = fakeWav('a knee');
  assert.ok(wavPeak(speech)! > 0.2);
  const silent = Buffer.from(speech);
  silent.fill(0, 44);
  assert.equal(wavPeak(silent), 0);
});
