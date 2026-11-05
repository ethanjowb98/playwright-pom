import { readFileSync } from 'node:fs';

import { AUTH, SECRET_GUARD } from '../config/constants';
import { env } from '../config/env';

// Relative imports: SecretGuard and scripts/ load this file outside the tsconfig path aliases.

/** The account password, or `undefined` when none is configured (nothing can leak it then). */
export function readPassword(): string | undefined {
  try {
    return env.password;
  } catch {
    return undefined;
  }
}

/** The api key once the setup project has written it; `undefined` while missing or unreadable. */
export function readApiKey(): string | undefined {
  try {
    return (JSON.parse(readFileSync(AUTH.apiKeyFile, 'utf8')) as { apiKey?: string }).apiKey;
  } catch {
    return undefined;
  }
}

/**
 * The session cookie values in the saved `storageState` (setup writes it during the run). The session
 * unlocks `GET /api/profile`, which returns the api key, so it is a secret like the key itself. Empty
 * while missing or unreadable.
 */
export function readSessionCookies(): string[] {
  try {
    const { cookies = [] } = JSON.parse(readFileSync(AUTH.storageState, 'utf8')) as {
      cookies?: { value?: string }[];
    };
    return cookies.map(({ value }) => value).filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

/**
 * Each secret as typed, JSON-escaped (allure .json files) and URL-encoded. Secrets shorter than
 * `SECRET_GUARD.minSecretLength` are left out: they would match ordinary text.
 */
export function secretNeedles(secrets: readonly (string | undefined)[]): string[] {
  return secrets
    .filter((secret): secret is string => (secret?.length ?? 0) >= SECRET_GUARD.minSecretLength)
    .flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)]);
}

/**
 * Replaces every needle with `***`, longest first: when one secret contains another (the password
 * inside the api key), masking the shorter one first would leave the rest of the longer one.
 */
export function redactSecrets(text: string, needles: readonly string[]): string {
  return [...needles]
    .sort((a, b) => b.length - a.length)
    .reduce((redacted, needle) => redacted.split(needle).join('***'), text);
}
