import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { fakePng, fakeWav } from './fake-media.js';
import { OpenAIProvider } from './openai-provider.js';
import type { ProviderError } from './provider.js';

/** An SDK client whose transport is a scripted fetch: no network, real request/response shapes. */
function clientWith(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return new OpenAI({
    apiKey: 'test',
    maxRetries: 0,
    fetch: (async (url: string | URL | Request, init?: RequestInit) =>
      handler(String(url), init ?? {})) as unknown as typeof fetch,
  });
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_test', ...headers },
  });
const context = { jobId: 'j', stage: 'plan' as const, targetId: 'plan' };
const textRequest = {
  context,
  model: 'gpt-test',
  schemaName: 'course_plan',
  schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  system: 'sys',
  user: 'user',
  payload: null,
};

test('structured text: success, refusal, incomplete and rate limit', async () => {
  let sent: { url: string; body: Record<string, unknown> } | null = null;
  const ok = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith((url, init) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return json(200, {
        id: 'resp_1',
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: '{"vocabulary":[]}' }] },
        ],
        usage: { input_tokens: 12, output_tokens: 7 },
      });
    }),
  });
  const result = await ok.generateText(textRequest);
  assert.ok(result.ok);
  assert.deepEqual(result.data, { vocabulary: [] });
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 7 });
  assert.equal(result.requestId, 'req_test');
  assert.match(sent!.url, /\/responses$/);
  const format = (sent!.body.text as { format: Record<string, unknown> }).format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.strict, true);
  assert.equal(format.name, 'course_plan');
  assert.equal(sent!.body.model, 'gpt-test');

  const refusing = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith(() =>
      json(200, {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
      }),
    ),
  });
  const refused = await refusing.generateText(textRequest);
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.refusal, 'no');

  const truncated = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith(() =>
      json(200, {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":' }] }],
      }),
    ),
  });
  await assert.rejects(
    truncated.generateText(textRequest),
    (e: ProviderError) => e.kind === 'retryable',
  );

  const limited = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith(() => json(429, { error: { message: 'Rate limit reached' } })),
  });
  await assert.rejects(
    limited.generateText(textRequest),
    (e: ProviderError) => e.kind === 'retryable' && e.status === 429,
  );
  const unauthorized = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith(() => json(401, { error: { message: 'Incorrect API key' } })),
  });
  await assert.rejects(
    unauthorized.generateText(textRequest),
    (e: ProviderError) => e.kind === 'permanent' && e.status === 401,
  );
});

test('images come back as PNG bytes and speech as WAV bytes', async () => {
  const png = fakePng('cover');
  const imageProvider = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith((url, init) => {
      assert.match(url, /\/images\/generations$/);
      const body = JSON.parse(String(init.body));
      assert.equal(body.output_format, 'png');
      assert.equal(body.size, '1536x1024');
      return json(200, { data: [{ b64_json: png.toString('base64') }] });
    }),
  });
  const image = await imageProvider.generateImage({
    context: { ...context, stage: 'cover', targetId: 'cover' },
    model: 'gpt-image-test',
    prompt: 'a fox',
    size: '1536x1024',
    quality: 'low',
  });
  assert.deepEqual(image.png, png);

  const wav = fakeWav('fox');
  const speechProvider = new OpenAIProvider({
    apiKey: 'x',
    client: clientWith((url, init) => {
      assert.match(url, /\/audio\/speech$/);
      const body = JSON.parse(String(init.body));
      assert.equal(body.response_format, 'wav');
      assert.equal(body.voice, 'coral');
      return new Response(new Uint8Array(wav), {
        status: 200,
        headers: { 'content-type': 'audio/wav', 'x-request-id': 'req_audio' },
      });
    }),
  });
  const speech = await speechProvider.synthesizeSpeech({
    context: { ...context, stage: 'audio', targetId: 'fox' },
    model: 'tts-test',
    voice: 'coral',
    text: 'A fox',
    instructions: 'slowly',
  });
  assert.deepEqual(speech.wav, wav);
  assert.equal(speech.requestId, 'req_audio');
});
