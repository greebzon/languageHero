export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors: FieldErrors = {},
    public readonly body: unknown = null,
  ) {
    super(message);
  }
}

const listeners = new Set<() => void>();
/** Called whenever the API answers 401: the session provider drops the user. */
export const onUnauthorized = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const response = await fetch(`/v1/admin${path}`, {
    method: options.method ?? (options.body || options.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined),
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = (data ?? {}) as { code?: string; message?: string; fieldErrors?: FieldErrors };
    if (response.status === 401) for (const listener of listeners) listener();
    throw new ApiError(
      response.status,
      error.code ?? 'http_error',
      error.message ?? `Ошибка ${response.status}`,
      error.fieldErrors ?? {},
      data,
    );
  }
  return data as T;
}

export const describeError = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Неизвестная ошибка';
