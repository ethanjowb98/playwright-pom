import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { expect, test as setup } from '@playwright/test';

import { AUTH, ENDPOINTS } from '@config/constants';
import { env } from '@config/env';

interface Profile {
  username: string;
  api_key?: string;
}

setup('should authenticate via API and persist session and api key', async ({ request }) => {
  const login = await request.post(ENDPOINTS.login, {
    data: { username: env.username, password: env.password },
  });
  expect(login.ok(), `POST ${ENDPOINTS.login} returned ${login.status()}`).toBe(true);

  const profileResponse = await request.get(ENDPOINTS.profile);
  expect(
    profileResponse.ok(),
    `GET ${ENDPOINTS.profile} returned ${profileResponse.status()}`,
  ).toBe(true);
  const profile = (await profileResponse.json()) as Profile;
  expect(profile.api_key, 'profile should expose an api_key').toMatch(/^\S+$/);

  mkdirSync(dirname(AUTH.storageState), { recursive: true });
  await request.storageState({ path: AUTH.storageState });
  writeFileSync(
    AUTH.apiKeyFile,
    JSON.stringify({ username: profile.username, apiKey: profile.api_key }, null, 2),
  );
});
