import type { FastifyInstance } from 'fastify';
import { loginInputSchema } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { AdminError, parseInput } from '../errors.js';
import {
  SESSION_COOKIE,
  authenticate,
  createSession,
  requireAdmin,
  revokeSession,
} from '../auth.js';

export async function authRoutes(app: FastifyInstance, options: AdminOptions) {
  const cookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: options.cookieSecure,
  };
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = parseInput(loginInputSchema, request.body);
      const user = await authenticate(options.db, input.login, input.password);
      if (!user) throw new AdminError(401, 'invalid_credentials', 'Неверный логин или пароль');
      const session = await createSession(options.db, user.id, options.sessionTtlHours);
      reply.setCookie(SESSION_COOKIE, session.token, { ...cookie, expires: session.expiresAt });
      return { user };
    },
  );
  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await revokeSession(options.db, token);
    reply.clearCookie(SESSION_COOKIE, cookie);
    return reply.code(204).send();
  });
  app.get('/auth/me', { preHandler: requireAdmin }, async (request) => ({ user: request.admin }));
}
