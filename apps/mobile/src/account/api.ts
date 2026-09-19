import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '../content/client';
import { currentLocale, translate, translateOptional } from '../i18n';

/** A server error in the interface language (the server's Russian text when the code is new). */
export function serverText(data: { code?: string; message?: string }): string | undefined {
  return (
    (data.code && translateOptional(currentLocale(), `app.server.${data.code}`)) || data.message
  );
}
let token: string | null = null;
const key = `lh.session.${apiUrl.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
export class AccountError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function loadCredential() {
  token = Platform.OS === 'web' ? null : await SecureStore.getItemAsync(key);
  return token;
}
export async function saveCredential(value: string | null) {
  token = value;
  if (Platform.OS !== 'web') {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  }
}
export async function accountRequest<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(`${apiUrl}/v1/account${path}`, {
      method,
      credentials: 'include',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new AccountError(
        response.status,
        serverText(data) ?? translate(currentLocale(), 'app.api.failed'),
        data.code,
      );
    return data;
  } catch (e) {
    if (e instanceof AccountError) throw e;
    throw new AccountError(0, translate(currentLocale(), 'app.api.offline'));
  } finally {
    clearTimeout(timer);
  }
}
