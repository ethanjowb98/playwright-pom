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

interface KeyedCall {
  call: string;
  act: (clients: KeyedApiClients, seeder: DataSeeder) => Promise<unknown>;
}

/**
 * Every endpoint behind the api key. Ids are unknown on purpose: the key is checked before the lookup,
 * so a 404 would mean the request got past authentication.
 */
const keyedCalls: KeyedCall[] = [
  { call: 'products are listed', act: ({ productsApi }) => productsApi.list() },
  {
    call: 'a product is created',
    // Anything wrongly created is still cleaned up.
    act: ({ productsApi }, seeder) =>
      productsApi.create(buildProduct()).then((p) => seeder.trackProduct(p)),
  },
  {
    call: 'a product is updated',
    act: ({ productsApi }) => productsApi.update(TEST_DATA.unknownId, { price: 1 }),
  },
  {
    call: 'a product is deleted',
    act: ({ productsApi }) => productsApi.remove(TEST_DATA.unknownId),
  },
  { call: 'the basket is read', act: ({ basketApi }) => basketApi.list() },
  { call: 'orders are listed', act: ({ ordersApi }) => ordersApi.list() },
];

/** Calls that would change the account-wide basket or orders if the key check failed: `@stateful`. */
const accountKeyedCalls: KeyedCall[] = [
  { call: 'a basket item is added', act: ({ basketApi }) => basketApi.add(TEST_DATA.unknownId, 1) },
  {
    call: 'a basket item is updated',
    act: ({ basketApi }) => basketApi.setQuantity(TEST_DATA.unknownId, 1),
  },
  {
    call: 'a basket item is removed',
    act: ({ basketApi }) => basketApi.remove(TEST_DATA.unknownId),
  },
  { call: 'the basket is cleared', act: ({ basketApi }) => basketApi.clear() },
  {
    call: 'an order is placed',
    act: ({ ordersApi }, seeder) => ordersApi.place().then((order) => seeder.trackOrder(order)),
  },
  {
    call: 'an order is updated',
    act: ({ ordersApi }) => ordersApi.update(TEST_DATA.unknownId, { status: 'shipped' }),
  },
  { call: 'an order is deleted', act: ({ ordersApi }) => ordersApi.remove(TEST_DATA.unknownId) },
];

/** One 401 test per bad key and call. */
function rejectsBadKeys(calls: KeyedCall[]): void {
  for (const { name, apiKey } of badKeys) {
    for (const { call, act } of calls) {
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
}

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

      // The username is not a secret; the api key is compared as a boolean so a failure never prints it.
      expect(profile.username).toBe(env.username);
      expect(profile.api_key === apiKey, 'profile api_key is the session api key').toBe(true);
    },
  );

  test.describe('Login', () => {
    // A retry would spend another rate-limited login.
    test.describe.configure({ retries: 0 });

    for (const { condition, body, status } of badLogins) {
      test(
        `should reject the login with ${status} when ${condition}`,
        { tag: [TAGS.regression, TAGS.login] },
        async ({ authApi }) => {
          await labels({ story: 'Login', severity: Severity.CRITICAL });

          await expect(authApi.login(...body())).rejects.toMatchObject({ status });
        },
      );
    }
  });

  test(
    'should reject the profile request with 401 when there is no session',
    { tag: [TAGS.regression] },
    async ({ authApi }) => {
      await labels({ story: 'Session', severity: Severity.CRITICAL });

      await expect(authApi.profile()).rejects.toMatchObject({ status: 401 });
    },
  );

  rejectsBadKeys(keyedCalls);

  test.describe('Account-wide calls', { tag: [TAGS.stateful] }, () => {
    rejectsBadKeys(accountKeyedCalls);
  });
});
