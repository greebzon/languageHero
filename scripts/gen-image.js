// Generates one picture with the OpenAI Images API.
//   node scripts/gen-image.js "prompt" output.png [1024x1024|1024x1536|1536x1024] [transparent|auto] [low|medium|high]
// The key comes from OPENAI_API_KEY or, when that is unset, from apps/api/.env.
// The model comes from OPENAI_IMAGE_MODEL (same source), default gpt-image-2.5-flare like the API,
// so one-off pictures match the generated sets.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [prompt, out, size = '1024x1024', bg = 'auto', quality] = process.argv.slice(2);
if (!prompt || !out) {
  console.error(
    'Usage: node scripts/gen-image.js "prompt" output.png [1024x1024] [transparent] [low|medium|high]',
  );
  process.exit(2);
}
const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api/.env');
function fromEnvFile(name) {
  try {
    const line = readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}
const apiKey = process.env.OPENAI_API_KEY || fromEnvFile('OPENAI_API_KEY');
if (!apiKey) {
  console.error('OPENAI_API_KEY is not set (env or apps/api/.env)');
  process.exit(2);
}
const model =
  process.env.OPENAI_IMAGE_MODEL || fromEnvFile('OPENAI_IMAGE_MODEL') || 'gpt-image-2.5-flare';

const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model,
    prompt,
    size, // 1024x1024, 1024x1536, 1536x1024
    background: bg, // "transparent" for icons and sprites (PNG output)
    ...(quality ? { quality } : {}),
  }),
});
const data = await res.json();
if (!res.ok || !data.data?.[0]?.b64_json) {
  console.error(JSON.stringify(data.error ?? data, null, 2));
  process.exit(1);
}
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, Buffer.from(data.data[0].b64_json, 'base64'));
console.log('Saved:', out, `(${model}, ${size}, background ${bg}${quality ? `, ${quality}` : ''})`);
