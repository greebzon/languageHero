import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { largerBox, shrinkPng } from './renditions.js';
import { thumbnail } from './thumbnail.js';

/** A noisy picture (like generated art), so a palette copy is really smaller. */
async function picture(width: number, height: number, alpha = false) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 2463534242; // xorshift32
  for (let i = 0; i < raw.length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    raw[i] = seed & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

test('shrinkPng fits the box, keeps the aspect ratio and writes a palette PNG', async () => {
  const out = (await shrinkPng(await picture(1536, 1024), { width: 1024, height: 1024 }))!;
  const meta = await sharp(out).metadata();
  assert.deepEqual([meta.width, meta.height, meta.format], [1024, 683, 'png']);
  assert.equal(out[25], 3); // colour type 3: indexed
  const tall = (await shrinkPng(await picture(1024, 1536, true), { width: 512, height: 768 }))!;
  const tallMeta = await sharp(tall).metadata();
  assert.deepEqual([tallMeta.width, tallMeta.height, tallMeta.hasAlpha], [512, 768, true]);
});

test('shrinkPng never enlarges and gives up when the copy is not smaller', async () => {
  const flat = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#3a8' },
  })
    .png({ palette: true })
    .toBuffer();
  assert.equal(await shrinkPng(flat, { width: 384, height: 384 }), null);
});

test('largerBox takes the bigger side of both', () => {
  assert.deepEqual(largerBox(undefined, { width: 1, height: 2 }), { width: 1, height: 2 });
  assert.deepEqual(largerBox({ width: 5, height: 1 }, { width: 1, height: 2 }), {
    width: 5,
    height: 2,
  });
});

test('thumbnail is cached on disk and skipped when nothing shrinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lingvo-thumbs-'));
  try {
    const source = join(root, 'wide.png');
    await writeFile(source, await picture(800, 400));
    const first = (await thumbnail(root, 'abc', source, 320))!;
    const meta = await sharp(first).metadata();
    assert.deepEqual([meta.width, meta.height], [320, 160]);
    const cached = join(root, 'thumbs', 'abc-320.png');
    assert.deepEqual(await readFile(cached), first);
    const { mtimeMs } = await stat(cached);
    assert.deepEqual(await thumbnail(root, 'abc', source, 320), first);
    assert.equal((await stat(cached)).mtimeMs, mtimeMs);
    assert.equal(await thumbnail(root, 'missing', join(root, 'none.png'), 320), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
