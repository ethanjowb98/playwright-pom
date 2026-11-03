import { faker } from '@faker-js/faker';

import { TAGS, TEST_DATA } from '@config/constants';
import { env } from '@config/env';
import { type DataSeeder } from '@data/DataSeeder';
import { buildProduct } from '@data/factories/productFactory';
import { expect, test, type KeyedApiClients } from '@fixtures';
import { labels, Severity } from '@utils/allure';

const badKeys = [
  { name: 'missing', apiKey: null },
  { name: 'invalid', apiKey: TEST_DATA.invalidApiKey },
] as const;

const keyedCalls: {
  call: string;
  act: (clients: KeyedApiClients, seeder: DataSeeder) => Promise<unknown>;
}[] = [
  { call: 'products are listed', act: ({ productsApi }) => productsApi.list() },
  {
    call: 'a product is created',
    // Anything wrongly created is still cleaned up.
    act: ({ productsApi }, seeder) =>
      productsApi.create(buildProduct()).then((p) => seeder.trackProduct(p)),
  },
  { call: 'the basket is read', act: ({ basketApi }) => basketApi.list() },
  { call: 'orders are listed', act: ({ ordersApi }) => ordersApi.list() },
];

const badLogins: { condition: string; body: () => [string, string]; status: number }[] = [
  {
    condition: 'the password is wrong',
    body: () => [env.username, faker.internet.password()],
    status: 401,
  },
  { condition: 'the password is missing', body: () => [env.username, ''], status: 400 },
];

test.describe('Auth API', { tag: [TAGS.api] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Auth' });
  });

  // POST /api/login allows 10 requests per 15 min per IP. A successful login is already proven by the
  // setup project, so this test reuses its session and only the negative cases below spend logins.
  test(
    'should return the account api key in the profile when the session is valid',
    { tag: [TAGS.smoke] },
    async ({ sessionAuthApi, apiKey }) => {
      await labels({ story: 'Session', severity: Severity.BLOCKER });

      const profile = await sessionAuthApi.profile();

      // Compared as booleans so a failure never prints credentials.
      expect(profile.username === env.username, 'profile is for the logged-in user').toBe(true);
      expect(profile.api_key === apiKey, 'profile api_key is the session api key').toBe(true);
    },
  );

  for (const { condition, body, status } of badLogins) {
    test(
      `should reject the login with ${status} when ${condition}`,
      { tag: [TAGS.regression] },
      async ({ authApi }) => {
        await labels({ story: 'Login', severity: Severity.CRITICAL });

        await expect(authApi.login(...body())).rejects.toMatchObject({ status });
      },
    );
  }

  test(
    'should reject the profile request with 401 when there is no session',
    { tag: [TAGS.regression] },
    async ({ authApi }) => {
      await labels({ story: 'Session', severity: Severity.CRITICAL });

      await expect(authApi.profile()).rejects.toMatchObject({ status: 401 });
    },
  );

  for (const { name, apiKey } of badKeys) {
    for (const { call, act } of keyedCalls) {
      test(
        `should return 401 when ${call} with a ${name} api key`,
        { tag: [TAGS.regression] },
        async ({ apiClientsFor, seeder }) => {
          await labels({ story: 'Api key', severity: Severity.CRITICAL });

          await expect(act(apiClientsFor(apiKey), seeder)).rejects.toMatchObject({ status: 401 });
        },
      );
    }
  }
});
