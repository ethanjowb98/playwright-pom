import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  type APIRequestContext,
  expect,
  type PlaywrightWorkerArgs,
  test as setup,
} from '@playwright/test';

import { AUTH, ENDPOINTS } from '@config/constants';
import { env } from '@config/env';

interface Profile {
  username: string;
  api_key?: string;
}

type Playwright = PlaywrightWorkerArgs['playwright'];

/** The profile behind the session on `request`, or `undefined` when the session is missing or expired. */
async function currentProfile(request: APIRequestContext): Promise<Profile | undefined> {
  const response = await request.get(ENDPOINTS.profile);
  if (!response.ok()) return undefined;
  const profile = (await response.json()) as Profile;
  return profile.api_key ? profile : undefined;
}

async function persist(request: APIRequestContext, profile: Profile): Promise<void> {
  mkdirSync(dirname(AUTH.storageState), { recursive: true });
  await request.storageState({ path: AUTH.storageState });
  writeFileSync(
    AUTH.apiKeyFile,
    JSON.stringify({ username: profile.username, apiKey: profile.api_key }, null, 2),
  );
}

/** Re-saves the stored session when it still belongs to the configured user; false when a login is needed. */
async function reuseSavedSession(playwright: Playwright, baseURL?: string): Promise<boolean> {
  if (!existsSync(AUTH.storageState)) return false;
  const saved = await playwright.request.newContext({ baseURL, storageState: AUTH.storageState });
  try {
    const profile = await currentProfile(saved);
    if (profile?.username !== env.username) return false;
    await persist(saved, profile);
    return true;
  } finally {
    await saved.dispose();
  }
}

async function logIn(request: APIRequestContext): Promise<void> {
  const login = await request.post(ENDPOINTS.login, {
    data: { username: env.username, password: env.password },
  });
  expect(login.ok(), `POST ${ENDPOINTS.login} returned ${login.status()}`).toBe(true);

  const profile = await currentProfile(request);
  if (!profile) throw new Error(`GET ${ENDPOINTS.profile} exposed no api_key after login`);
  await persist(request, profile);
}

/** Login is rate-limited (10 per 15 min per IP), so a still-valid saved session is reused instead. */
async function ensureSession(
  playwright: Playwright,
  request: APIRequestContext,
  baseURL?: string,
): Promise<string> {
  if (await reuseSavedSession(playwright, baseURL)) return 'reused saved session';
  await logIn(request);
  return 'logged in via API';
}

setup(
  'should authenticate via API and persist session and api key',
  async ({ playwright, baseURL, request }) => {
    const description = await ensureSession(playwright, request, baseURL);
    setup.info().annotations.push({ type: 'auth', description });

    const saved = JSON.parse(readFileSync(AUTH.apiKeyFile, 'utf8')) as { apiKey?: string };
    expect(saved.apiKey, 'the persisted api key should be usable').toMatch(/^\S+$/);
  },
);
