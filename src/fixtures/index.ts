import { readFileSync } from 'node:fs';

import { test as base, expect } from '@playwright/test';

import { AuthApi } from '@api/AuthApi';
import { BasketApi } from '@api/BasketApi';
import { DocumentedApi } from '@api/DocumentedApi';
import { MaintenanceApi } from '@api/MaintenanceApi';
import { OrdersApi } from '@api/OrdersApi';
import { ProductsApi } from '@api/ProductsApi';
import { AUTH } from '@config/constants';
import { DataSeeder } from '@data/DataSeeder';

/** The api-key clients, built for an arbitrary key (or none) for 401 tests. */
export interface KeyedApiClients {
  productsApi: ProductsApi;
  basketApi: BasketApi;
  ordersApi: OrdersApi;
}

interface ApiFixtures {
  /** Builds clients that send `apiKey` (`null` sends no `Authorization` header). */
  apiClientsFor: (apiKey: string | null) => KeyedApiClients;
  /** Swagger-documented paths, for contract tests. */
  documentedApi: DocumentedApi;
  /** Fresh session-less context. `POST /api/login` is rate-limited (10 per 15 min per IP): spend logins sparingly. */
  authApi: AuthApi;
  /** Reuses the session cookie written by the setup project, so it costs no login. */
  sessionAuthApi: AuthApi;
  productsApi: ProductsApi;
  basketApi: BasketApi;
  ordersApi: OrdersApi;
  maintenanceApi: MaintenanceApi;
  /** Seeds data through the API; everything it tracked is deleted after the test, pass or fail. */
  seeder: DataSeeder;
}

interface WorkerFixtures {
  /** Market api key written by tests/setup/auth.setup.ts. */
  apiKey: string;
}

export const test = base.extend<ApiFixtures, WorkerFixtures>({
  apiKey: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
    async ({}, use) => {
      const { apiKey } = JSON.parse(readFileSync(AUTH.apiKeyFile, 'utf8')) as { apiKey?: string };
      if (!apiKey) {
        throw new Error(`No apiKey in ${AUTH.apiKeyFile}. Run the setup project first.`);
      }
      await use(apiKey);
    },
    { scope: 'worker' },
  ],
  apiClientsFor: async ({ request }, use) => {
    await use((apiKey) => ({
      productsApi: new ProductsApi(request, apiKey),
      basketApi: new BasketApi(request, apiKey),
      ordersApi: new OrdersApi(request, apiKey),
    }));
  },
  documentedApi: async ({ request, apiKey }, use) => {
    await use(new DocumentedApi(request, apiKey));
  },
  authApi: async ({ request }, use) => {
    await use(new AuthApi(request, null));
  },
  sessionAuthApi: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      storageState: AUTH.storageState,
    });
    await use(new AuthApi(context, null));
    await context.dispose();
  },
  productsApi: async ({ request, apiKey }, use) => {
    await use(new ProductsApi(request, apiKey));
  },
  basketApi: async ({ request, apiKey }, use) => {
    await use(new BasketApi(request, apiKey));
  },
  ordersApi: async ({ request, apiKey }, use) => {
    await use(new OrdersApi(request, apiKey));
  },
  maintenanceApi: async ({ request, apiKey }, use) => {
    await use(new MaintenanceApi(request, apiKey));
  },
  seeder: async ({ productsApi, basketApi, ordersApi }, use) => {
    const seeder = new DataSeeder(productsApi, basketApi, ordersApi);
    await use(seeder);
    await seeder.cleanup();
  },
});

export { expect };
