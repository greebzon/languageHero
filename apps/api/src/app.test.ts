import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';

test('health responds without an API key or database', async () => {
  const app = buildApp();
  try {
    const result = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().status, 'ok');
    // Without a database the admin panel routes do not exist at all.
    assert.equal((await app.inject('/v1/admin/auth/me')).statusCode, 404);
  } finally {
    await app.close();
  }
});
