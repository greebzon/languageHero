import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeOutfitLayer,
  coverage,
  cutLayer,
  itemPalette,
  replaceBody,
  seamDrift,
  estimateAlignment,
  warp,
  zoneFor,
  zoneMaskPng,
  zoneTop,
} from './outfit-compose.js';
import { decodePng, encodePng, type Raster } from './png.js';
import { fakePng, maskPng } from './fake-media.js';

/* A "character": a solid block body with a head on top, on a transparent canvas. */
function figure(width: number, height: number, shift = 0, scale = 1, hat = false): Raster {
  const rgba = new Uint8Array(width * height * 4);
  const paint = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    g: number,
    b: number,
  ) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1)
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
        const o = (y * width + x) * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = 255;
      }
  };
  const s = (v: number) => Math.round(v * scale + shift);
  paint(s(30), s(10), s(70), s(40), 240, 150, 60); // head
  paint(s(35), s(40), s(65), s(90), 220, 120, 40); // body
  paint(s(30), s(90), s(70), s(100), 200, 60, 20); // feet
  if (hat) paint(s(28), s(2), s(72), s(14), 30, 60, 220); // a blue hat on top of the head
  return { width, height, rgba };
}
const slots = {
  head: { x: 0.25, y: 0.05, w: 0.5, h: 0.3 },
  eyes: { x: 0.3, y: 0.2, w: 0.4, h: 0.08 },
  outfit: { x: 0.3, y: 0.36, w: 0.4, h: 0.45 },
  back: { x: 0.15, y: 0.3, w: 0.7, h: 0.5 },
  companion: { x: 0.75, y: 0.3, w: 0.2, h: 0.2 },
};

test('png codec round-trips RGBA and reads the fake provider files', () => {
  const src = figure(100, 110);
  const back = decodePng(encodePng(src));
  assert.deepEqual([back.width, back.height], [100, 110]);
  assert.deepEqual(Array.from(back.rgba), Array.from(src.rgba));
  const fake = decodePng(fakePng('seed', 24, 16));
  assert.equal(fake.width, 24);
  assert.equal(fake.rgba[3], 255);
  const mask = decodePng(maskPng(20, 10, { x: 0.5, y: 0, w: 0.5, h: 1 }));
  assert.equal(mask.rgba[3], 255);
  assert.equal(mask.rgba[15 * 4 + 3], 0);
});

test('the hat zone stops above the eyes, clothes get the whole body below the shoulders', () => {
  const hat = zoneFor(slots, 'head');
  assert.equal(hat.y, slots.head.y);
  assert.ok(
    hat.y + hat.h <= slots.eyes.y + slots.eyes.h * 0.3 + 0.001,
    'hat zone must end near the eye line',
  );
  assert.deepEqual(zoneFor(slots, 'eyes'), slots.eyes);
  const clothes = zoneFor(slots, 'outfit');
  assert.deepEqual([clothes.x, clothes.w, clothes.y + clothes.h], [0, 1, 1]);
  // The neckline dips in the middle of the torso and meets the shoulder line at its sides.
  const cx = slots.outfit.x + slots.outfit.w / 2;
  assert.ok(zoneTop(clothes, cx) > clothes.y + 0.03, 'the neckline dips at the centre');
  assert.equal(zoneTop(clothes, slots.head.x + 0.01), clothes.y);
  const mask = decodePng(zoneMaskPng(100, 100, clothes));
  const alpha = (x: number, y: number) => mask.rgba[(y * 100 + x) * 4 + 3];
  const row = Math.floor(clothes.y * 100) + 1;
  assert.equal(alpha(5, row), 0, 'the shoulder line is editable');
  assert.equal(alpha(Math.floor(cx * 100), row), 255, 'the chest above the neckline is kept');
  assert.equal(alpha(Math.floor(cx * 100), 95), 0);
  assert.equal(alpha(50, 5), 255);
  assert.ok(
    clothes.y >= slots.outfit.y && clothes.y <= slots.outfit.y + 0.03,
    'the zone starts at the shoulders',
  );
  assert.ok(clothes.y > slots.eyes.y + slots.eyes.h, 'the face stays outside the zone');
});

test('a shifted and scaled edit is aligned back, and only the added hat becomes the layer', () => {
  const body = figure(100, 110);
  const edit = figure(100, 110, 6, 0.9, true);
  const zone = { x: 0.2, y: 0, w: 0.6, h: 0.2 };
  const t = estimateAlignment(body, edit, 'head', zone)!;
  assert.ok(Math.abs(t.scale - 1 / 0.9) < 0.03, `scale ${t.scale}`);
  const aligned = warp(edit, body, t);
  assert.ok(aligned.rgba[(95 * 100 + 50) * 4 + 3]! > 200, 'feet land where the body has them');
  const result = composeOutfitLayer(body, edit, 'head', zone);
  assert.equal(result.ok, true, result.ok ? '' : result.reason);
  if (result.ok) {
    assert.ok(result.drift < 6, `drift ${result.drift}`);
    assert.ok(coverage(result.layer, zone) > 0.2, 'the hat covers a good part of the zone');
    // Unchanged head pixels inside the zone (beyond the 3px outline margin) stay transparent;
    // the hat itself is opaque.
    assert.equal(result.layer.rgba[(21 * 100 + 50) * 4 + 3], 0);
    assert.ok(result.layer.rgba[(7 * 100 + 50) * 4 + 3]! > 200);
    assert.equal(result.layer.rgba[(100 * 100 + 50) * 4 + 3], 0);
  }
});

test('edits that redraw the character or paint nothing are rejected', () => {
  const body = figure(100, 110);
  const zone = { x: 0.2, y: 0, w: 0.6, h: 0.2 };
  const redrawn = figure(100, 110);
  for (let y = 40; y < 100; y += 1)
    for (let x = 30; x < 70; x += 1) {
      const o = (y * 100 + x) * 4;
      if (!redrawn.rgba[o + 3]) continue;
      redrawn.rgba[o] = 20;
      redrawn.rgba[o + 1] = 250;
      redrawn.rgba[o + 2] = 20;
    }
  const rejected = composeOutfitLayer(body, redrawn, 'head', zone);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.reason, /вне зоны/);
  const untouched = composeOutfitLayer(body, figure(100, 110), 'head', zone);
  assert.equal(untouched.ok, false);
  if (!untouched.ok) assert.match(untouched.reason, /не нарисовала/);
});

test('a redrawn outline a few pixels over is not part of the item, a hat is', () => {
  const body = figure(100, 110);
  // The edit keeps the pose but the whole head sits 2 px to the right, and wears a hat.
  const edit = figure(100, 110);
  for (let y = 10; y < 40; y += 1)
    for (let x = 71; x >= 30; x -= 1)
      for (let c = 0; c < 4; c += 1)
        edit.rgba[(y * 100 + x) * 4 + c] = edit.rgba[(y * 100 + x - 2) * 4 + c]!;
  for (let y = 2; y < 14; y += 1)
    for (let x = 28; x < 72; x += 1) {
      const o = (y * 100 + x) * 4;
      edit.rgba[o] = 30;
      edit.rgba[o + 1] = 60;
      edit.rgba[o + 2] = 220;
      edit.rgba[o + 3] = 255;
    }
  // A head-coloured blob far from the hat: a redrawn ear, not part of the item.
  for (let y = 25; y < 35; y += 1)
    for (let x = 74; x < 79; x += 1) {
      const o = (y * 100 + x) * 4;
      edit.rgba[o] = 240;
      edit.rgba[o + 1] = 150;
      edit.rgba[o + 2] = 60;
      edit.rgba[o + 3] = 255;
    }
  const zone = { x: 0.2, y: 0, w: 0.6, h: 0.45 };
  const strict = cutLayer(edit, body, zone, { threshold: 36, grow: 0, feather: 0 });
  const tolerant = cutLayer(edit, body, zone, { threshold: 36, grow: 0, feather: 0, tolerance: 4 });
  // Column 70 is the moved right edge of the head: head colour where the body is transparent.
  assert.ok(strict.rgba[(25 * 100 + 70) * 4 + 3]! > 0, 'a plain diff keeps the moved edge');
  assert.equal(tolerant.rgba[(25 * 100 + 70) * 4 + 3], 0, 'the tolerant cut drops it');
  assert.ok(tolerant.rgba[(7 * 100 + 50) * 4 + 3]! > 200, 'the hat stays');
  assert.ok(tolerant.rgba[(30 * 100 + 76) * 4 + 3]! > 0, 'the tolerant cut alone keeps the blob');
  const novel = cutLayer(edit, body, zone, {
    threshold: 36,
    grow: 0,
    feather: 0,
    tolerance: 4,
    novelty: 2,
    reach: 12,
  });
  assert.equal(novel.rgba[(30 * 100 + 76) * 4 + 3], 0, 'a blob in the body colours is dropped');
  assert.ok(novel.rgba[(7 * 100 + 50) * 4 + 3]! > 200, 'the hat still stays');
  // A lone 2×2 speck in a new colour goes with the area filter; the hat (44×12) stays.
  for (const [x, y] of [
    [22, 40],
    [23, 40],
    [22, 41],
    [23, 41],
  ] as const) {
    const o = (y * 100 + x) * 4;
    edit.rgba[o] = 10;
    edit.rgba[o + 1] = 200;
    edit.rgba[o + 2] = 10;
    edit.rgba[o + 3] = 255;
  }
  // A new colour the item does not have (a pale redrawn ear) is not the item: with the icon's
  // palette only the blue hat seeds the layer.
  for (let y = 16; y < 24; y += 1)
    for (let x = 22; x < 27; x += 1) {
      const o = (y * 100 + x) * 4;
      edit.rgba[o] = 250;
      edit.rgba[o + 1] = 215;
      edit.rgba[o + 2] = 205;
      edit.rgba[o + 3] = 255;
    }
  const icon = { width: 4, height: 4, rgba: new Uint8Array(64) };
  for (let i = 0; i < 16; i += 1) icon.rgba.set([30, 60, 220, 255], i * 4);
  const byIcon = cutLayer(edit, body, zone, {
    threshold: 36,
    grow: 0,
    feather: 0,
    novelty: 2,
    reach: 12,
    palette: itemPalette(icon),
  });
  assert.equal(byIcon.rgba[(20 * 100 + 24) * 4 + 3], 0, 'a pale ear is not in the hat palette');
  assert.ok(byIcon.rgba[(7 * 100 + 50) * 4 + 3]! > 200, 'the hat is in it');
  const clean = cutLayer(edit, body, zone, { threshold: 36, grow: 0, feather: 0, minArea: 20 });
  assert.equal(clean.rgba[(40 * 100 + 22) * 4 + 3], 0, 'the speck is dropped');
  assert.ok(clean.rgba[(7 * 100 + 50) * 4 + 3]! > 200, 'the hat is kept');
});

test('clothes become a whole-character picture: the original head on the new body', () => {
  const body = figure(100, 110);
  const edit = figure(100, 110);
  // The model repaints the torso blue below the neck and moves the right paw (outside the
  // head columns) up.
  for (let y = 48; y < 100; y += 1)
    for (let x = 30; x < 70; x += 1) {
      const o = (y * 100 + x) * 4;
      if (!edit.rgba[o + 3]) continue;
      edit.rgba[o] = 30;
      edit.rgba[o + 1] = 60;
      edit.rgba[o + 2] = 220;
    }
  for (let y = 20; y < 30; y += 1)
    for (let x = 80; x < 90; x += 1) {
      const o = (y * 100 + x) * 4;
      edit.rgba[o] = 30;
      edit.rgba[o + 1] = 60;
      edit.rgba[o + 2] = 220;
      edit.rgba[o + 3] = 255;
    }
  const zone = { x: 0, y: 0.4, w: 1, h: 0.6, keep: { x: 0.25, y: 0, w: 0.5, h: 0.45 } };
  assert.ok(seamDrift(body, edit, zone, 2) < 1, 'the neck is untouched');
  const layer = replaceBody(body, edit, zone, 2);
  const px = (x: number, y: number) =>
    Array.from(layer.rgba.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4));
  assert.deepEqual(px(50, 20), [240, 150, 60, 255], 'the head is the original');
  assert.deepEqual(px(50, 70), [30, 60, 220, 255], 'the torso is the edit');
  assert.deepEqual(px(85, 25), [30, 60, 220, 255], 'beside the head the edit is taken too');
  assert.equal(px(10, 70)[3], 0, 'the background stays empty');
  // A neck the model left out shows as a bad seam.
  const gap = figure(100, 110);
  for (let y = 38; y < 46; y += 1)
    for (let x = 0; x < 100; x += 1) gap.rgba[(y * 100 + x) * 4 + 3] = 0;
  assert.ok(seamDrift(body, gap, zone, 2) > 40, 'a gap at the neck is a bad seam');
});
