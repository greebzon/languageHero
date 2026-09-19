import type { GenerationInput } from '@lingvohero/contracts';
import type { GenerationStage } from '../db/schema.js';

/** Who is asking: lets the fake provider stay deterministic and inject failures per stage. */
export type RequestContext = {
  jobId: string;
  stage: GenerationStage;
  targetId: string;
  simulate?: GenerationInput['simulate'];
};

export type TextRequest = {
  context: RequestContext;
  model: string;
  schemaName: string;
  /** JSON Schema (strict) the model must follow. */
  schema: Record<string, unknown>;
  system: string;
  user: string;
  /** The structured facts the prompt was rendered from; only the fake provider reads it. */
  payload: unknown;
  maxOutputTokens?: number;
  /** PNG pictures the model must look at (vision), e.g. a mascot body to locate its slots. */
  images?: Buffer[];
};
export type TextUsage = { inputTokens: number; outputTokens: number };
export type TextResult =
  | { ok: true; data: unknown; usage: TextUsage; requestId: string | null }
  | { ok: false; refusal: string; requestId: string | null };

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';
export type ImageRequest = {
  context: RequestContext;
  model: string;
  prompt: string;
  size: ImageSize;
  quality: string;
  /** Transparent PNG for sprites, icons and mascot bodies. */
  background?: 'transparent' | 'auto';
};
export type ImageResult = { png: Buffer; requestId: string | null };
/**
 * Repaints part of a picture. `images[0]` is the canvas; further images are references the
 * prompt may point at ("the item in the second picture"). Only the transparent area of `mask`
 * (same size as the canvas) may change, which is how a wearable lands on one body part.
 */
export type ImageEditRequest = {
  context: RequestContext;
  model: string;
  prompt: string;
  images: Buffer[];
  mask?: Buffer;
  size: ImageSize;
  quality: string;
  background?: 'transparent' | 'auto';
};

export type SpeechRequest = {
  context: RequestContext;
  model: string;
  voice: string;
  text: string;
  instructions: string;
};
export type SpeechResult = { wav: Buffer; requestId: string | null };

export interface GenerationProvider {
  readonly name: 'openai' | 'fake';
  generateText(request: TextRequest): Promise<TextResult>;
  generateImage(request: ImageRequest): Promise<ImageResult>;
  editImage(request: ImageEditRequest): Promise<ImageResult>;
  synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult>;
}

export type ErrorKind = 'retryable' | 'permanent';

/** Every provider failure is normalised to this so the queue can decide about retries. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: ErrorKind,
    public readonly status: number | null = null,
    public readonly requestId: string | null = null,
  ) {
    super(message);
  }
}

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const networkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'ABORT_ERR',
]);

/** Rate limits, outages and network hiccups are retried; everything else is a real failure. */
export function classifyError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const e = error as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
    requestID?: string;
    request_id?: string;
    headers?: Record<string, string> | { get?: (name: string) => string | null };
  };
  const requestId = e.requestID ?? e.request_id ?? null;
  const status = typeof e.status === 'number' ? e.status : null;
  const message = (e.message ?? String(error)).slice(0, 500);
  if (status !== null)
    return new ProviderError(
      message,
      retryableStatuses.has(status) ? 'retryable' : 'permanent',
      status,
      requestId,
    );
  if (
    e.name === 'AbortError' ||
    e.name === 'APIConnectionError' ||
    e.name === 'APIConnectionTimeoutError' ||
    (e.code && networkCodes.has(e.code))
  )
    return new ProviderError(message, 'retryable', null, requestId);
  return new ProviderError(message, 'permanent', null, requestId);
}
