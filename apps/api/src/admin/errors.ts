import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export type FieldErrors = Record<string, string[]>;

/** Structured admin error: `{code, message, fieldErrors?, requestId}` with an HTTP status. */
export class AdminError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AdminError(
      400,
      'invalid_input',
      'Проверьте поля формы',
      fieldErrorsFromZod(result.error),
    );
  return result.data;
}

export function adminErrorHandler(
  error: FastifyError | AdminError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AdminError)
    return reply.code(error.status).send({
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      requestId: request.id,
    });
  const fastifyError = error as FastifyError;
  if (fastifyError.validation)
    return reply
      .code(400)
      .send({ code: 'invalid_input', message: 'Неверный запрос', requestId: request.id });
  if (fastifyError.statusCode === 413)
    return reply
      .code(413)
      .send({ code: 'too_large', message: 'Слишком большой запрос', requestId: request.id });
  if (fastifyError.statusCode === 429)
    return reply
      .code(429)
      .send({ code: 'rate_limited', message: 'Слишком много попыток', requestId: request.id });
  if (fastifyError.statusCode && fastifyError.statusCode < 500)
    return reply.code(fastifyError.statusCode).send({
      code: fastifyError.code ?? 'bad_request',
      message: fastifyError.message,
      requestId: request.id,
    });
  // Name, code and stack only: driver messages may carry query parameters (emails, texts).
  request.log.error({
    err: {
      name: (error as Error).name,
      code: (error as { code?: string }).code,
      stack: (error as Error).stack?.split('\n').slice(1, 6).join('\n'),
    },
  });
  return reply
    .code(500)
    .send({ code: 'internal', message: 'Внутренняя ошибка сервера', requestId: request.id });
}
