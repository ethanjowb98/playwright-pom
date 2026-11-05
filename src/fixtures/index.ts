import { readFileSync } from 'node:fs';

import { type APIRequestContext, test as base, expect } from '@playwright/test';

import { AuthApi } from '@api/AuthApi';
import { BasketApi } from '@api/BasketApi';
import { DocumentedApi } from '@api/DocumentedApi';
import { MaintenanceApi } from '@api/MaintenanceApi';
import { OrdersApi } from '@api/OrdersApi';
import { ProductsApi } from '@api/ProductsApi';
import { AUTH, MAINTENANCE } from '@config/constants';
import { DataSeeder } from '@data/DataSeeder';
import { LoginPage } from '@pages/LoginPage';
import { MarketPage } from '@pages/MarketPage';

/**
 * `POST /api/reset` wipes the whole shared account, so its client refuses to exist outside the
 * `maintenance` project: a reset in a parallel project would destroy every running test's data.
 */
function assertMaintenanceProject(project: string): void {
  if (project !== MAINTENANCE.project) {
    throw new Error(
      `MaintenanceApi resets the whole account: only the "${MAINTENANCE.project}" project ` +
        `(npm run ${MAINTENANCE.script}) may use it, not "${project}".`,
    );
  }
}

/** The api-key clients, built for an arbitrary key (or none) for 401 tests. */
export interface KeyedApiClients {
  productsApi: ProductsApi;
  basketApi: BasketApi;
  ordersApi: OrdersApi;
  /** `reset` wipes the account: throws outside the `maintenance` project. */
  readonly maintenanceApi: MaintenanceApi;
}

interface ApiFixtures {
  /**
   * Cookie-less request context behind every api-key client. The built-in `request` inherits the project's
   * storageState (the browser session in the `stateful` project), so it would authenticate twice.
   */
  apiRequest: APIRequestContext;
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

interface PageFixtures {
  /** Home page with the login modal. Use with an empty storageState; each submit spends a rate-limited login. */
  loginPage: LoginPage;
  /** Market app, not yet opened: seed through the API first, then `open()`. */
  marketPage: MarketPage;
}

interface WorkerFixtures {
  /** Market api key written by tests/setup/auth.setup.ts. */
  apiKey: string;
}

export const test = base.extend<ApiFixtures & PageFixtures, WorkerFixtures>({
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
  apiRequest: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    await use(context);
    await context.dispose();
  },
  apiClientsFor: async ({ apiRequest }, use, testInfo) => {
    await use((apiKey) => ({
      productsApi: new ProductsApi(apiRequest, apiKey),
      basketApi: new BasketApi(apiRequest, apiKey),
      ordersApi: new OrdersApi(apiRequest, apiKey),
      // A getter, so only a test that touches it is checked.
      get maintenanceApi(): MaintenanceApi {
        assertMaintenanceProject(testInfo.project.name);
        return new MaintenanceApi(apiRequest, apiKey);
      },
    }));
  },
  documentedApi: async ({ apiRequest, apiKey }, use) => {
    await use(new DocumentedApi(apiRequest, apiKey));
  },
  authApi: async ({ apiRequest }, use) => {
    await use(new AuthApi(apiRequest, null));
  },
  sessionAuthApi: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      storageState: AUTH.storageState,
    });
    await use(new AuthApi(context, null));
    await context.dispose();
  },
  productsApi: async ({ apiRequest, apiKey }, use) => {
    await use(new ProductsApi(apiRequest, apiKey));
  },
  basketApi: async ({ apiRequest, apiKey }, use) => {
    await use(new BasketApi(apiRequest, apiKey));
  },
  ordersApi: async ({ apiRequest, apiKey }, use) => {
    await use(new OrdersApi(apiRequest, apiKey));
  },
  maintenanceApi: async ({ apiRequest, apiKey }, use, testInfo) => {
    assertMaintenanceProject(testInfo.project.name);
    await use(new MaintenanceApi(apiRequest, apiKey));
  },
  seeder: async ({ productsApi, basketApi, ordersApi }, use) => {
    const seeder = new DataSeeder(productsApi, basketApi, ordersApi);
    await use(seeder);
    await seeder.cleanup();
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  marketPage: async ({ page }, use) => {
    await use(new MarketPage(page));
  },
});

export { expect };
