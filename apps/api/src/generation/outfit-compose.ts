/* Turns an image edit («the mascot wearing the item») into a stackable outfit layer.
   Image models re-frame the picture slightly, so the edit is first aligned to the body using
   a region the item cannot touch, then only the slot box is kept with a feathered edge, and
   the rest of the body is compared with the original: a large difference means the model
   redrew the character and the layer is rejected. All maths on 8-bit RGBA rasters. */
import type { MascotSlot, MascotSlots, SlotBox } from '@lingvohero/contracts';
import { encodePng, type Raster } from './png.js';

type Bounds = { left: number; top: number; right: number; bottom: number } | null;
const ALPHA_ON = 96;

/**
 * Where an item may be painted: a box, optionally with a neckline — the top edge dips in the
 * middle of the torso like a collar. The model fills the mask to its edge, so a straight top
 * edge becomes a straight cut through the chest; a curved one reads as the garment's own
 * neckline. `cx`, `halfW` and `depth` are fractions of the picture. The zone deliberately stays
 * below the shoulder line beside the head too: letting it climb along raised paws (tried) made
 * the model re-imagine the whole character — new pose, wings turned into sleeves.
 */
export type Zone = SlotBox & {
  neckline?: { cx: number; halfW: number; depth: number };
  /* Clothes only: the head box. Above the neckline inside these columns the original picture
     is kept; everything else of a clothes layer comes from the model's picture. Below
     `taperFrom` (the eye line) the kept columns narrow to the neckline's width, following the
     chin: paws raised to shoulder height beside the head must come from the model's picture
     whole, not half from each. */
  keep?: SlotBox & { taperFrom?: number };
};
/** The zone's top edge (a fraction of the height) above the column at `xFrac`. */
export function zoneTop(zone: Zone, xFrac: number): number {
  if (!zone.neckline) return zone.y;
  const t = (xFrac - zone.neckline.cx) / zone.neckline.halfW;
  return Math.abs(t) >= 1 ? zone.y : zone.y + zone.neckline.depth * (1 - t * t);
}
/** Pixel-space bounds of the zone plus the first row inside it for every column. */
function zoneRows(zone: Zone, width: number, height: number) {
  const left = Math.max(0, Math.floor(zone.x * width));
  const top = Math.max(0, Math.floor(zone.y * height));
  const right = Math.min(width, Math.ceil((zone.x + zone.w) * width));
  const bottom = Math.min(height, Math.ceil((zone.y + zone.h) * height));
  const topAt = new Int32Array(width);
  for (let x = 0; x < width; x += 1)
    topAt[x] = Math.max(top, Math.floor(zoneTop(zone, (x + 0.5) / width) * height));
  const inside = (x: number, y: number) => x >= left && x < right && y >= topAt[x]! && y < bottom;
  return { left, top, right, bottom, topAt, inside };
}
/** Mask for the Images API: opaque where the picture must stay, transparent inside the zone. */
export function zoneMaskPng(width: number, height: number, zone: Zone): Buffer {
  const { inside } = zoneRows(zone, width, height);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) rgba[(y * width + x) * 4 + 3] = inside(x, y) ? 0 : 255;
  return encodePng({ width, height, rgba });
}

/**
 * The area an item of this slot may paint. Headwear gets the top of the head down to the eye
 * line only: leaving the face outside the mask is what stops the model from redrawing it.
 * Clothes get everything from the shoulders down across the full width: a costume covers the
 * arms, legs and feet too, and a torso-only box would cut it into a rectangle. The zone starts
 * at the shoulders themselves (the torso box minus its growth margin): a big cartoon head hangs
 * over the shoulders, and a zone reaching into the chin lets the model repaint the muzzle,
 * which then shows as a pale band with a straight seam.
 */
export function zoneFor(slots: MascotSlots, slot: MascotSlot): Zone {
  if (slot === 'outfit') {
    const top = Math.min(0.95, slots.outfit.y + 0.02);
    const { x, w } = slots.outfit;
    return {
      x: 0,
      y: top,
      w: 1,
      h: 1 - top,
      neckline: { cx: x + w / 2, halfW: w * 0.55, depth: Math.min(0.05, (1 - top) / 4) },
      keep: { ...slots.head, taperFrom: slots.eyes.y + slots.eyes.h },
    };
  }
  if (slot !== 'head') return slots[slot];
  const { head, eyes } = slots;
  // A brim may reach the eyebrows, so the zone ends a little below the top of the eye band.
  const bottom = Math.min(head.y + head.h, Math.max(head.y + 0.05, eyes.y + eyes.h * 0.3));
  return { x: head.x, y: head.y, w: head.w, h: bottom - head.y };
}

function alphaBounds(r: Raster, rowFrom: number, rowTo: number): Bounds {
  let left = r.width;
  let right = -1;
  let top = r.height;
  let bottom = -1;
  for (let y = Math.max(0, rowFrom); y < Math.min(r.height, rowTo); y += 1)
    for (let x = 0; x < r.width; x += 1)
      if (r.rgba[(y * r.width + x) * 4 + 3]! >= ALPHA_ON) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  return right < 0 ? null : { left, top, right, bottom };
}
/**
 * Rows of the body an item in this slot never changes: below a hat, above a cape or suit. For
 * clothes the anchor stops at the eye line (`anchorBottom`, a fraction of the height) when it
 * is known: hands raised to chin height sit above the shoulders too, and the model redraws
 * them freely, which would throw the scale estimate off.
 */
function anchorRows(
  slot: MascotSlot,
  box: SlotBox,
  height: number,
  anchorBottom?: number,
): [number, number] {
  const bottom = Math.ceil((box.y + box.h) * height);
  const top = Math.floor(box.y * height);
  if (slot === 'head' || slot === 'eyes') return [bottom, height];
  return [0, anchorBottom === undefined ? top : Math.min(top, Math.floor(anchorBottom * height))];
}
export type Alignment = { scale: number; dx: number; dy: number };
/** Similarity transform (scale + shift) that maps the edit onto the body frame. */
export function estimateAlignment(
  body: Raster,
  edit: Raster,
  slot: MascotSlot,
  box: Zone,
  anchorBottom?: number,
): Alignment | null {
  const [from, to] = anchorRows(slot, box, body.height, anchorBottom);
  const a = alphaBounds(body, from, to);
  const b = alphaBounds(edit, from, to);
  if (!a || !b) return null;
  const scaleX = (a.right - a.left + 1) / (b.right - b.left + 1);
  const scaleY = (a.bottom - a.top + 1) / (b.bottom - b.top + 1);
  const scale = (scaleX + scaleY) / 2;
  const dx = (a.left + a.right) / 2 - scale * ((b.left + b.right) / 2);
  const dy = (a.top + a.bottom) / 2 - scale * ((b.top + b.bottom) / 2);
  return { scale, dx, dy };
}
/** Resamples `edit` into the body frame (bilinear). */
export function warp(
  edit: Raster,
  target: { width: number; height: number },
  t: Alignment,
): Raster {
  const out = new Uint8Array(target.width * target.height * 4);
  for (let y = 0; y < target.height; y += 1)
    for (let x = 0; x < target.width; x += 1) {
      const sx = (x - t.dx) / t.scale;
      const sy = (y - t.dy) / t.scale;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= edit.width - 1 || y0 >= edit.height - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * target.width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const p = (yy: number, xx: number) =>
          edit.rgba[((yy * edit.width + xx) * 4 + c) as number]!;
        out[o + c] = Math.round(
          p(y0, x0) * (1 - fx) * (1 - fy) +
            p(y0, x0 + 1) * fx * (1 - fy) +
            p(y0 + 1, x0) * (1 - fx) * fy +
            p(y0 + 1, x0 + 1) * fx * fy,
        );
      }
    }
  return { width: target.width, height: target.height, rgba: out };
}
/** Mean absolute colour difference over pixels opaque in the body and outside the zone. */
export function driftOutside(body: Raster, aligned: Raster, zone: Zone): number {
  const { inside } = zoneRows(zone, body.width, body.height);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < body.height; y += 1)
    for (let x = 0; x < body.width; x += 1) {
      if (inside(x, y)) continue;
      const o = (y * body.width + x) * 4;
      if (body.rgba[o + 3]! < ALPHA_ON) continue;
      sum +=
        Math.abs(body.rgba[o]! - aligned.rgba[o]!) +
        Math.abs(body.rgba[o + 1]! - aligned.rgba[o + 1]!) +
        Math.abs(body.rgba[o + 2]! - aligned.rgba[o + 2]!) +
        Math.abs(body.rgba[o + 3]! - aligned.rgba[o + 3]!);
      n += 1;
    }
  return n ? sum / n / 4 : 0;
}
export type Feather = { top: number; right: number; bottom: number; left: number };
/** Soft edges per slot: wide where the zone border crosses the body (a costume's neckline, a
 * brim at the eye line), so the model's slight repaint of the fur next to the border fades out
 * instead of ending in a straight seam. */
export function featherFor(slot: MascotSlot): Feather {
  const f = { top: 4, right: 4, bottom: 4, left: 4 };
  if (slot === 'outfit') return { ...f, top: 10 };
  if (slot === 'head') return { ...f, bottom: 12 };
  return f;
}
/**
 * The layer is what the item added: pixels inside the slot box that differ from the body
 * (colour or coverage), grown by a few pixels so outlines are kept whole, with a soft edge.
 * Everything the model left alone stays transparent, so the body shows through untouched and
 * a slightly imperfect alignment cannot leave seams.
 */
export function cutLayer(
  aligned: Raster,
  body: Raster,
  zone: Zone,
  options: {
    threshold: number;
    grow: number;
    feather: number | Feather;
    tolerance?: number;
    /* Drop changed pixels painted in colours the body has nearby unless they sit next to
       pixels in new colours: a redrawn ear is fur-coloured all over, a cap is green with a
       brown badge inside it. `novelty` is that neighbourhood in pixels (0 keeps every changed
       pixel); `reach` is how far around a pixel the body is searched for its colour. */
    novelty?: number;
    reach?: number;
    /* The item's own colours (see `itemPalette`): a new colour counts only when the item has
       it too. The model sometimes swaps a character's ears for different ones under a hat,
       in colours the body lacks nearby - they are not the hat's colours. */
    palette?: Uint8Array;
    /* Connected pieces smaller than this many pixels are dropped: stray fur strokes the
       model adds next to an item, never the item itself. */
    minArea?: number;
  } = {
    threshold: 36,
    grow: 3,
    feather: 4,
  },
): Raster {
  // The model redraws what is under the mask slightly differently (an ear a few pixels over,
  // a thicker outline), and pixel-by-pixel that reads as a second ear next to the hat. A pixel
  // counts as the item only when nothing of a similar colour lies within `tolerance` pixels in
  // the body: a moved outline finds its twin nearby, a hat over fur does not.
  const tolerance = options.tolerance ?? 0;
  const feather: Feather =
    typeof options.feather === 'number'
      ? {
          top: options.feather,
          right: options.feather,
          bottom: options.feather,
          left: options.feather,
        }
      : options.feather;
  const { width, height } = aligned;
  const { left, top, right, bottom, topAt } = zoneRows(zone, width, height);
  const w = right - left;
  const h = bottom - top;
  let mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (top + y < topAt[left + x]!) continue;
      const o = ((top + y) * width + (left + x)) * 4;
      const a = aligned.rgba;
      const b = body.rgba;
      const diff = Math.max(
        Math.abs(a[o]! - b[o]!),
        Math.abs(a[o + 1]! - b[o + 1]!),
        Math.abs(a[o + 2]! - b[o + 2]!),
        Math.abs(a[o + 3]! - b[o + 3]!),
      );
      if (diff < options.threshold || a[o + 3]! < ALPHA_ON) continue;
      let twin = false;
      for (let dy = -tolerance; dy <= tolerance && !twin; dy += 1)
        for (let dx = -tolerance; dx <= tolerance; dx += 1) {
          if (!dx && !dy) continue;
          const yy = top + y + dy;
          const xx = left + x + dx;
          if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
          const p = (yy * width + xx) * 4;
          if (
            Math.abs(a[o]! - b[p]!) < options.threshold &&
            Math.abs(a[o + 1]! - b[p + 1]!) < options.threshold &&
            Math.abs(a[o + 2]! - b[p + 2]!) < options.threshold &&
            Math.abs(a[o + 3]! - b[p + 3]!) < options.threshold
          ) {
            twin = true;
            break;
          }
        }
      if (!twin) mask[y * w + x] = 1;
    }
  if (options.novelty)
    mask = keepNovel(mask, aligned, body, { left, top, w, h }, options) as typeof mask;
  if (options.minArea) mask = dropSpecks(mask, w, h, options.minArea) as typeof mask;
  for (let step = 0; step < options.grow; step += 1) {
    const next = new Uint8Array(mask);
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1)
        if (
          !mask[y * w + x] &&
          ((x > 0 && mask[y * w + x - 1]) ||
            (x < w - 1 && mask[y * w + x + 1]) ||
            (y > 0 && mask[(y - 1) * w + x]) ||
            (y < h - 1 && mask[(y + 1) * w + x]))
        )
          next[y * w + x] = 1;
    mask = next;
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      const fade = Math.min(
        1,
        (x + 1) / (feather.left + 1),
        (w - x) / (feather.right + 1),
        (top + y - topAt[left + x]! + 1) / (feather.top + 1),
        (h - y) / (feather.bottom + 1),
      );
      const o = ((top + y) * width + (left + x)) * 4;
      out[o] = aligned.rgba[o]!;
      out[o + 1] = aligned.rgba[o + 1]!;
      out[o + 2] = aligned.rgba[o + 2]!;
      out[o + 3] = Math.round(aligned.rgba[o + 3]! * fade);
    }
  return { width, height, rgba: out };
}
/** Colour bins (16 levels per channel) of an item icon's opaque pixels, ignoring rare ones. */
export function itemPalette(icon: Raster): Uint8Array {
  const counts = new Uint32Array(4096);
  let total = 0;
  for (let i = 0; i < icon.width * icon.height; i += 1) {
    const o = i * 4;
    if (icon.rgba[o + 3]! < 200) continue;
    counts[
      ((icon.rgba[o]! >> 4) << 8) | ((icon.rgba[o + 1]! >> 4) << 4) | (icon.rgba[o + 2]! >> 4)
    ]! += 1;
    total += 1;
  }
  const palette = new Uint8Array(4096);
  const min = Math.max(1, total * 0.0005);
  for (let i = 0; i < 4096; i += 1) if (counts[i]! >= min) palette[i] = 1;
  return palette;
}
/** Whether a colour falls into the palette, with one neighbouring bin of slack per channel. */
function inPalette(palette: Uint8Array, r: number, g: number, b: number): boolean {
  for (let dr = -1; dr <= 1; dr += 1)
    for (let dg = -1; dg <= 1; dg += 1)
      for (let db = -1; db <= 1; db += 1) {
        const rr = (r >> 4) + dr;
        const gg = (g >> 4) + dg;
        const bb = (b >> 4) + db;
        if (rr < 0 || gg < 0 || bb < 0 || rr > 15 || gg > 15 || bb > 15) continue;
        if (palette[(rr << 8) | (gg << 4) | bb]) return true;
      }
  return false;
}
/**
 * Keeps the changed pixels whose colour the body does not have nearby (within `reach`
 * pixels, sampled on a coarse grid), plus everything changed within `novelty` pixels of them.
 * A redrawn ear is fur-coloured next to the real ear and goes; a cap is green over brown fur
 * and stays, with its brown badge inside it. The palette is local on purpose: an owl has
 * yellow tufts, and a gold crown on the top of its head must not count as "owl colours".
 * When almost nothing is new (an item in the character's own colours) the mask is returned
 * untouched.
 */
function keepNovel(
  mask: Uint8Array,
  aligned: Raster,
  body: Raster,
  zone: { left: number; top: number; w: number; h: number },
  options: { threshold: number; novelty?: number; reach?: number; palette?: Uint8Array },
): Uint8Array {
  const { left, top, w, h } = zone;
  const { width, height } = aligned;
  const reach = options.reach ?? options.novelty! * 6;
  // Fine enough not to skip a 2 px outline, which would otherwise pass as a new colour.
  const step = Math.max(1, Math.min(2, Math.round(reach / 10)));
  const a = aligned.rgba;
  const b = body.rgba;
  const known = (x: number, y: number, o: number) => {
    for (let yy = y - reach; yy <= y + reach; yy += step) {
      if (yy < 0 || yy >= height) continue;
      for (let xx = x - reach; xx <= x + reach; xx += step) {
        if (xx < 0 || xx >= width) continue;
        const p = (yy * width + xx) * 4;
        // Anti-aliased silhouette edges still carry the outline colour.
        if (
          b[p + 3]! >= 32 &&
          Math.abs(a[o]! - b[p]!) < options.threshold &&
          Math.abs(a[o + 1]! - b[p + 1]!) < options.threshold &&
          Math.abs(a[o + 2]! - b[p + 2]!) < options.threshold
        )
          return true;
      }
    }
    return false;
  };
  const novel = new Uint8Array(w * h);
  let changed = 0;
  let fresh = 0;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      changed += 1;
      const o = ((top + y) * width + (left + x)) * 4;
      if (
        !known(left + x, top + y, o) &&
        (!options.palette || inPalette(options.palette, a[o]!, a[o + 1]!, a[o + 2]!))
      ) {
        novel[y * w + x] = 1;
        fresh += 1;
      }
    }
  if (!changed || fresh < changed * 0.02) return mask;
  const r = options.novelty!;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      let near = novel[y * w + x] === 1;
      for (let dy = -r; dy <= r && !near; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && novel[yy * w + xx]) {
            near = true;
            break;
          }
        }
      }
      if (near) out[y * w + x] = 1;
    }
  return out;
}
/**
 * Removes connected components (4-neighbourhood) smaller than `minArea` pixels or than a
 * tenth of the largest one: a sliver of a redrawn ear next to a crown is a few per cent of
 * the crown, while an item split in two similar halves keeps both.
 */
function dropSpecks(mask: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const label = new Int32Array(w * h);
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  const parts: number[][] = [];
  let next = 0;
  for (let start = 0; start < w * h; start += 1) {
    if (!mask[start] || label[start]) continue;
    next += 1;
    const members: number[] = [];
    stack.push(start);
    label[start] = next;
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % w;
      const y = (i - x) / w;
      const around = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const j of around)
        if (j >= 0 && mask[j] && !label[j]) {
          label[j] = next;
          stack.push(j);
        }
    }
    parts.push(members);
  }
  const largest = Math.max(0, ...parts.map((p) => p.length));
  for (const members of parts)
    if (members.length >= Math.max(minArea, largest * 0.1)) for (const i of members) out[i] = 1;
  return out;
}
/**
 * How much of the original picture a clothes layer keeps at a pixel, 0..1: 1 inside the head
 * (the `keep` columns above the neckline), 0 everywhere else, blended across `band` pixels
 * along that border so the two pictures meet without a hard edge.
 */
function keepWeight(zone: Zone, width: number, height: number, band: number) {
  const keep = zone.keep!;
  const cx = (keep.x + keep.w / 2) * width;
  const full = (keep.w / 2) * width;
  const neck = zone.neckline ? zone.neckline.halfW * width : full;
  const from = (keep.taperFrom ?? zone.y) * height;
  const to = (zone.y + (zone.neckline?.depth ?? 0)) * height;
  const topAt = new Float64Array(width);
  for (let x = 0; x < width; x += 1) topAt[x] = zoneTop(zone, (x + 0.5) / width) * height;
  return (x: number, y: number) => {
    const t = to > from ? Math.min(1, Math.max(0, (y - from) / (to - from))) : 0;
    const half = full + (Math.min(full, neck) - full) * t;
    const inside = Math.min(topAt[x]! - y, half - Math.abs(x + 0.5 - cx));
    return Math.min(1, Math.max(0, (inside + band / 2) / band));
  };
}
/**
 * Mean difference between the body and the edit where a clothes layer joins them (the blend
 * band around the kept head): a large value means the model moved the neck or shoulders and
 * the join would show.
 */
export function seamDrift(body: Raster, aligned: Raster, zone: Zone, band: number): number {
  const { width, height } = body;
  const weight = keepWeight(zone, width, height, band * 2);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const w = weight(x, y);
      if (w <= 0 || w >= 1) continue;
      const o = (y * width + x) * 4;
      if (body.rgba[o + 3]! < ALPHA_ON && aligned.rgba[o + 3]! < ALPHA_ON) continue;
      sum +=
        Math.abs(body.rgba[o]! - aligned.rgba[o]!) +
        Math.abs(body.rgba[o + 1]! - aligned.rgba[o + 1]!) +
        Math.abs(body.rgba[o + 2]! - aligned.rgba[o + 2]!) +
        Math.abs(body.rgba[o + 3]! - aligned.rgba[o + 3]!);
      n += 1;
    }
  return n ? sum / n / 4 : 0;
}
/**
 * A whole-character picture: the original head, the model's picture for everything else. The
 * app draws it instead of the body, not over it - a covering layer cannot hide what the model
 * moved (a paw a little higher, a foot a little aside would show twice).
 */
export function replaceBody(body: Raster, aligned: Raster, zone: Zone, band: number): Raster {
  const { width, height } = body;
  const weight = keepWeight(zone, width, height, band);
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const w = weight(x, y);
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1)
        out[o + c] = Math.round(body.rgba[o + c]! * w + aligned.rgba[o + c]! * (1 - w));
    }
  return { width, height, rgba: out };
}
/** Share of the zone the layer covers: an empty layer means the model painted nothing. */
export function coverage(layer: Raster, zone: Zone): number {
  const { left, top, right, bottom, inside } = zoneRows(zone, layer.width, layer.height);
  let on = 0;
  let area = 0;
  for (let y = top; y < bottom; y += 1)
    for (let x = left; x < right; x += 1) {
      if (!inside(x, y)) continue;
      area += 1;
      if (layer.rgba[(y * layer.width + x) * 4 + 3]! > 0) on += 1;
    }
  return on / Math.max(1, area);
}
export type ComposeResult =
  | { ok: true; layer: Raster; alignment: Alignment; drift: number }
  | { ok: false; reason: string; alignment?: Alignment; drift?: number };
/**
 * Full pipeline. Rejects edits that are re-framed beyond what a shift/scale explains or that
 * redraw the body: the caller retries the generation instead of shipping a mismatched layer.
 */
export function composeOutfitLayer(
  body: Raster,
  edit: Raster,
  slot: MascotSlot,
  box: Zone,
  // Calibrated on real edits: sleeves and hat brims spilling past the zone score 12–18,
  // a redrawn face or pose 30+.
  limits = { maxScaleDelta: 0.2, maxShift: 0.15, maxDrift: 22, maxSeam: 70 },
  anchorBottom?: number,
  /* The item's icon: headwear and glasses keep only new pixels in the icon's colours. */
  icon?: Raster,
): ComposeResult {
  const alignment = estimateAlignment(body, edit, slot, box, anchorBottom);
  if (!alignment) return { ok: false, reason: 'На картинке не нашлось тела для выравнивания' };
  if (
    Math.abs(alignment.scale - 1) > limits.maxScaleDelta ||
    Math.abs(alignment.dx) > limits.maxShift * body.width ||
    Math.abs(alignment.dy) > limits.maxShift * body.height
  )
    return { ok: false, reason: 'Модель перекадрировала персонажа', alignment };
  const identity =
    edit.width === body.width &&
    edit.height === body.height &&
    Math.abs(alignment.scale - 1) < 0.002 &&
    Math.abs(alignment.dx) < 0.5 &&
    Math.abs(alignment.dy) < 0.5;
  const aligned = identity ? edit : warp(edit, body, alignment);
  const drift = driftOutside(body, aligned, box);
  const painted = () =>
    coverage(cutLayer(aligned, body, box, { threshold: 36, grow: 0, feather: 0 }), box) >= 0.01;
  if (slot === 'outfit' && box.keep) {
    if (!painted()) return { ok: false, reason: 'Модель не нарисовала вещь', alignment, drift };
    // Clothes become a whole-character picture (see `replaceBody`): the original head on the
    // model's body. What matters is that the two meet at the neck.
    const band = Math.round(body.height * 0.012);
    const seam = seamDrift(body, aligned, box, band);
    if (seam > limits.maxSeam)
      return {
        ok: false,
        reason: `Модель сдвинула шею или плечи: стык с головой заметен (${seam.toFixed(1)})`,
        alignment,
        drift: seam,
      };
    return { ok: true, layer: replaceBody(body, aligned, box, band), alignment, drift: seam };
  }
  if (drift > limits.maxDrift)
    return {
      ok: false,
      reason: `Модель изменила персонажа вне зоны (${drift.toFixed(1)})`,
      alignment,
      drift,
    };
  if (!painted()) return { ok: false, reason: 'Модель не нарисовала вещь', alignment, drift };
  // Hats and glasses share their zone with ears, tufts and brows that the model redraws, so
  // only what differs from the body, in colours new to the head, counts there. A cape is
  // what differs, plainly: its colours are its own and the body under it stays.
  const onHead = slot === 'head' || slot === 'eyes';
  const layer = cutLayer(aligned, body, box, {
    threshold: 36,
    grow: 3,
    feather: featherFor(slot),
    tolerance: Math.max(2, Math.round(body.width * 0.004)),
    ...(onHead
      ? {
          novelty: Math.max(2, Math.round(body.width * 0.005)),
          reach: Math.max(6, Math.round(body.width * 0.045)),
          minArea: Math.round(body.width * body.height * 0.001),
          ...(icon ? { palette: itemPalette(icon) } : {}),
        }
      : {}),
  });
  return { ok: true, layer, alignment, drift };
}
