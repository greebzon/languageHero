import { createHash } from 'node:crypto';

export const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
export const clip = (text: string, max: number) => text.trim().slice(0, max);
export const bareLetters = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '') // drops spaces, articles' punctuation and Hebrew vowel points
    .slice(0, 24);

/** Deterministic shuffle so a re-run of the same input yields the same tiles. */
export function shuffle<T>(items: T[], seed: string) {
  const out = [...items];
  const digest = createHash('sha256').update(seed).digest();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = digest[i % digest.length]! % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
/** A deterministic coin flip for the same seed. */
export const coin = (seed: string) => createHash('sha256').update(seed).digest()[0]! % 2 === 0;
