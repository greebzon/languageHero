import { createHash } from 'node:crypto';
import { AdminError } from './errors.js';

export const MEDIA_LIMITS = { png: 5 * 1024 * 1024, wav: 10 * 1024 * 1024 } as const;

export type MediaInfo = {
  kind: 'image' | 'audio';
  mime: 'image/png' | 'audio/wav';
  ext: 'png' | 'wav';
  sha256: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

const invalid = (message: string) => new AdminError(422, 'invalid_media', message);

/**
 * Identifies a file by its real content, never by a client-provided name or MIME type, and
 * extracts the metadata the panel shows. Only the formats the mobile contract supports pass.
 */
export function inspectMedia(bytes: Buffer): MediaInfo {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    if (bytes.length > MEDIA_LIMITS.png) throw invalid('PNG больше 5 МБ');
    if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR')
      throw invalid('Повреждённый PNG');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192)
      throw invalid('Недопустимые размеры PNG');
    return {
      kind: 'image',
      mime: 'image/png',
      ext: 'png',
      sha256,
      byteSize: bytes.length,
      width,
      height,
    };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
    if (bytes.length > MEDIA_LIMITS.wav) throw invalid('WAV больше 10 МБ');
    let offset = 12;
    let byteRate = 0;
    let dataSize = -1;
    while (offset + 8 <= bytes.length) {
      const id = bytes.toString('ascii', offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      if (id === 'fmt ' && offset + 24 <= bytes.length) {
        const channels = bytes.readUInt16LE(offset + 10);
        const sampleRate = bytes.readUInt32LE(offset + 12);
        byteRate = bytes.readUInt32LE(offset + 16);
        if (channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 96000 || !byteRate)
          throw invalid('Неподдерживаемый формат WAV');
      } else if (id === 'data') {
        dataSize = Math.min(size, bytes.length - offset - 8);
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (!byteRate || dataSize <= 0) throw invalid('Повреждённый WAV');
    const durationMs = Math.round((dataSize / byteRate) * 1000);
    if (durationMs > 60_000) throw invalid('Аудио длиннее 60 секунд');
    return {
      kind: 'audio',
      mime: 'audio/wav',
      ext: 'wav',
      sha256,
      byteSize: bytes.length,
      durationMs,
    };
  }
  throw invalid('Поддерживаются только PNG и WAV');
}

/**
 * Loudest 16-bit PCM sample of a WAV as a share of full scale (0..1); null for other sample
 * formats. A valid WAV can still be silent: the TTS once returned «A knee» as 0.3 s of zeros.
 */
export function wavPeak(bytes: Buffer): number | null {
  let offset = 12;
  let bits = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ' && offset + 24 <= bytes.length) bits = bytes.readUInt16LE(offset + 22);
    else if (id === 'data') {
      if (bits !== 16) return null;
      const end = Math.min(bytes.length, offset + 8 + size) & ~1;
      let peak = 0;
      for (let i = offset + 8; i + 1 < end; i += 2)
        peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
      return peak / 32768;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

export const mediaFilename = (sha256: string, ext: 'png' | 'wav') => `${sha256}.${ext}`;
export const mediaPath = (sha256: string, ext: 'png' | 'wav') =>
  `/v1/media/${mediaFilename(sha256, ext)}`;
export const extFromPath = (path: string): 'png' | 'wav' => (path.endsWith('.png') ? 'png' : 'wav');
export const shaFromPath = (path: string) => path.split('/').pop()!.split('.')[0]!;
