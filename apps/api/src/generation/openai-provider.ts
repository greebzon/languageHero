import OpenAI, { toFile } from 'openai';
import {
  ProviderError,
  classifyError,
  type GenerationProvider,
  type ImageEditRequest,
  type ImageRequest,
  type SpeechRequest,
  type TextRequest,
} from './provider.js';

export type OpenAIProviderOptions = {
  apiKey: string;
  /** Milliseconds; the queue owns retries, so the SDK's own retries are disabled. */
  textTimeoutMs?: number;
  imageTimeoutMs?: number;
  speechTimeoutMs?: number;
  /** Injected in tests. */
  client?: OpenAI;
};

/**
 * Real provider. Text goes through the Responses API with strict JSON-schema output; images
 * through the Images API as PNG; speech through audio.speech as WAV. Nothing here reads the
 * database or the child's data: only the prompts built by the worker reach the network.
 */
export class OpenAIProvider implements GenerationProvider {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;
  private readonly timeouts: { text: number; image: number; speech: number };

  constructor(options: OpenAIProviderOptions) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    this.timeouts = {
      text: options.textTimeoutMs ?? 60_000,
      image: options.imageTimeoutMs ?? 120_000,
      speech: options.speechTimeoutMs ?? 60_000,
    };
  }

  async generateText(request: TextRequest) {
    try {
      const pictures = (request.images ?? []).map((png) => ({
        type: 'input_image' as const,
        image_url: `data:image/png;base64,${png.toString('base64')}`,
        detail: 'high' as const,
      }));
      const response = await this.client.responses.create(
        {
          model: request.model,
          input: [
            { role: 'system', content: request.system },
            pictures.length
              ? {
                  role: 'user',
                  content: [{ type: 'input_text' as const, text: request.user }, ...pictures],
                }
              : { role: 'user', content: request.user },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              schema: request.schema,
              strict: true,
            },
          },
          max_output_tokens: request.maxOutputTokens ?? 8000,
        },
        { timeout: this.timeouts.text },
      );
      const requestId = response._request_id ?? null;
      const refusal = findRefusal(response);
      if (refusal) return { ok: false as const, refusal, requestId };
      if (response.status === 'incomplete') {
        const reason = response.incomplete_details?.reason ?? 'unknown';
        // A truncated answer may succeed on retry; a content filter will not.
        throw new ProviderError(
          `Ответ не завершён (${reason})`,
          reason === 'content_filter' ? 'permanent' : 'retryable',
          null,
          requestId,
        );
      }
      const text = collectText(response);
      if (!text) throw new ProviderError('Пустой ответ модели', 'retryable', null, requestId);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new ProviderError('Ответ модели не является JSON', 'permanent', null, requestId);
      }
      return {
        ok: true as const,
        data,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        requestId,
      };
    } catch (error) {
      throw classifyError(error);
    }
  }

  async generateImage(request: ImageRequest) {
    try {
      const result = await this.client.images.generate(
        {
          model: request.model,
          prompt: request.prompt,
          size: request.size,
          quality: request.quality as 'low' | 'medium' | 'high',
          output_format: 'png',
          background: request.background ?? 'auto',
          n: 1,
        },
        { timeout: this.timeouts.image },
      );
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError('Провайдер не вернул изображение', 'retryable');
      return { png: Buffer.from(b64, 'base64'), requestId: result._request_id ?? null };
    } catch (error) {
      throw classifyError(error);
    }
  }

  async editImage(request: ImageEditRequest) {
    try {
      const images = await Promise.all(
        request.images.map((png, i) => toFile(png, `image-${i}.png`, { type: 'image/png' })),
      );
      const mask = request.mask
        ? await toFile(request.mask, 'mask.png', { type: 'image/png' })
        : undefined;
      const params = {
        model: request.model,
        image: images.length === 1 ? images[0]! : images,
        ...(mask ? { mask } : {}),
        prompt: request.prompt,
        size: request.size,
        quality: request.quality as 'low' | 'medium' | 'high',
        output_format: 'png' as const,
        background: request.background ?? 'auto',
        n: 1,
      };
      // Outfit layers are stacked on the untouched body: the character outside the mask must
      // survive the edit, which high input fidelity gives. Models without it get a plain edit.
      const result = await this.client.images
        .edit({ ...params, input_fidelity: 'high' }, { timeout: this.timeouts.image })
        .catch((error: unknown) => {
          if (/input_fidelity/.test(error instanceof Error ? error.message : ''))
            return this.client.images.edit(params, { timeout: this.timeouts.image });
          throw error;
        });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError('Провайдер не вернул изображение', 'retryable');
      return { png: Buffer.from(b64, 'base64'), requestId: result._request_id ?? null };
    } catch (error) {
      throw classifyError(error);
    }
  }

  async synthesizeSpeech(request: SpeechRequest) {
    try {
      const response = await this.client.audio.speech.create(
        {
          model: request.model,
          voice: request.voice,
          input: request.text,
          instructions: request.instructions,
          response_format: 'wav',
        },
        { timeout: this.timeouts.speech },
      );
      const wav = Buffer.from(await response.arrayBuffer());
      if (!wav.length) throw new ProviderError('Провайдер не вернул аудио', 'retryable');
      return { wav, requestId: response.headers.get('x-request-id') };
    } catch (error) {
      throw classifyError(error);
    }
  }
}

type OutputPart = { type?: string; refusal?: string; text?: string };
type OutputItem = { type?: string; content?: OutputPart[] };

function findRefusal(response: { output?: unknown[] }): string | null {
  for (const item of (response.output ?? []) as OutputItem[]) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? [])
      if (part.type === 'refusal' && part.refusal) return part.refusal;
  }
  return null;
}

/** The assistant text, read from the raw output so it does not depend on SDK conveniences. */
function collectText(response: { output?: unknown[] }): string {
  let text = '';
  for (const item of (response.output ?? []) as OutputItem[]) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) if (part.type === 'output_text') text += part.text ?? '';
  }
  return text;
}
