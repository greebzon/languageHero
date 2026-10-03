import type { FastifyInstance } from 'fastify';
import { loginInputSchema, passwordChangeSchema } from '@lingvohero/contracts';
import type { AdminOptions } from '../plugin.js';
import { AdminError, parseInput } from '../errors.js';
import { audit } from '../audit.js';
import {
  LOGIN_FAILURES_LIMIT,
  SESSION_COOKIE,
  authenticate,
  changePassword,
  normalizeLogin,
  recentLoginFailures,
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
      // Guessing one account from many addresses is capped per login, not only per IP.
      if ((await recentLoginFailures(options.db, input.login)) >= LOGIN_FAILURES_LIMIT)
        throw new AdminError(
          429,
          'login_locked',
          'Слишком много неудачных попыток. Подождите 15 минут.',
        );
      const user = await authenticate(options.db, input.login, input.password);
      const trail = { entityType: 'admin-login' as const, entityId: normalizeLogin(input.login) };
      if (!user) {
        await audit(options.db, {
          actorId: null,
          ...trail,
          action: 'login-failed',
          payload: { ip: request.ip },
        });
        throw new AdminError(401, 'invalid_credentials', 'Неверный логин или пароль');
      }
      await audit(options.db, {
        actorId: user.id,
        ...trail,
        action: 'login',
        payload: { ip: request.ip },
      });
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
  app.post(
    '/auth/password',
    { preHandler: requireAdmin, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const input = parseInput(passwordChangeSchema, request.body);
      const changed = await changePassword(
        options.db,
        request.admin!.id,
        input.currentPassword,
        input.newPassword,
        request.cookies[SESSION_COOKIE]!,
      );
      if (!changed)
        throw new AdminError(400, 'invalid_password', 'Неверный текущий пароль', {
          currentPassword: ['Неверный текущий пароль'],
        });
      return { ok: true };
    },
  );
  app.get('/auth/me', { preHandler: requireAdmin }, async (request) => ({ user: request.admin }));
}
