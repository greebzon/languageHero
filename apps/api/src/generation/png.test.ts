import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { decodePng } from './png.js';

test('palette PNGs (8 and 4 bit, with transparency) decode to the same pixels as sharp', async () => {
  const width = 37;
  const height = 11;
  for (const colours of [200, 12]) {
    const raw = Buffer.alloc(width * height * 4);
    for (let p = 0; p < width * height; p += 1) {
      const c = (p * 7) % colours;
      raw.set([c * 20, 255 - c * 9, (c * 53) & 0xff, c % 3 === 0 ? 0 : 255], p * 4);
    }
    const png = await sharp(raw, { raw: { width, height, channels: 4 } })
      .png({ palette: true, colours, dither: 0 })
      .toBuffer();
    assert.equal(png[25], 3);
    assert.equal(png[24], colours > 16 ? 8 : 4);
    const expected = await sharp(png).ensureAlpha().raw().toBuffer();
    const decoded = decodePng(png);
    assert.deepEqual([decoded.width, decoded.height], [width, height]);
    assert.deepEqual(Buffer.from(decoded.rgba), expected);
  }
});
