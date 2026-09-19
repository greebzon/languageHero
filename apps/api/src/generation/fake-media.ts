import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A small flat-colour PNG whose colour is derived from the seed; valid for `inspectMedia`. */
export function fakePng(seed: string, width = 96, height = 96): Buffer {
  const digest = createHash('sha256').update(seed).digest();
  const [r, g, b] = [digest[0]!, digest[1]!, digest[2]!];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const shade = (x + y) % 16 < 8 ? 0 : 24; // a checker so the file is not one flat block
      row[1 + x * 3] = Math.min(255, r + shade);
      row[2 + x * 3] = Math.min(255, g + shade);
      row[3 + x * 3] = Math.min(255, b + shade);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * An RGBA PNG for image-edit masks: opaque everywhere except the editable box, which is fully
 * transparent (that is what the Images API repaints). Encoded here because the API has no
 * raster library; a mask is a handful of flat rows and compresses to a few kilobytes.
 */
export function maskPng(
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
): Buffer {
  const left = Math.max(0, Math.floor(box.x * width));
  const top = Math.max(0, Math.floor(box.y * height));
  const right = Math.min(width, Math.ceil((box.x + box.w) * width));
  const bottom = Math.min(height, Math.ceil((box.y + box.h) * height));
  const opaque = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) opaque.writeUInt32BE(0x000000ff, 1 + x * 4);
  const cut = Buffer.from(opaque);
  for (let x = left; x < right; x += 1) cut.writeUInt32BE(0x00000000, 1 + x * 4);
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) rows.push(y >= top && y < bottom ? cut : opaque);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A short mono 16-bit sine tone (frequency from the seed) in a RIFF/WAVE container. */
export function fakeWav(seed: string, durationMs = 600, sampleRate = 24_000): Buffer {
  const digest = createHash('sha256').update(seed).digest();
  // Two tones from four digest bytes: enough variety that different seeds never collide.
  const frequency = 200 + (digest.readUInt16BE(0) % 800);
  const overtone = 900 + (digest.readUInt16BE(2) % 1200);
  const samples = Math.round((sampleRate * durationMs) / 1000);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / 400, (samples - i) / 400);
    const t = i / sampleRate;
    const value =
      (Math.sin(2 * Math.PI * frequency * t) * 0.3 + Math.sin(2 * Math.PI * overtone * t) * 0.1) *
      envelope;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
