import { readFileSync } from 'node:fs';

import { test as base, expect } from '@playwright/test';

import { AuthApi } from '@api/AuthApi';
import { BasketApi } from '@api/BasketApi';
import { MaintenanceApi } from '@api/MaintenanceApi';
import { OrdersApi } from '@api/OrdersApi';
import { ProductsApi } from '@api/ProductsApi';
import { AUTH } from '@config/constants';
import { DataSeeder } from '@data/DataSeeder';

interface ApiFixtures {
  authApi: AuthApi;
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
  authApi: async ({ request }, use) => {
    await use(new AuthApi(request, null));
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
