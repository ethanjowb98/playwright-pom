import { defineConfig, devices } from '@playwright/test';

import { AUTH, TAGS, TIMEOUTS } from './src/config/constants';
import { env } from './src/config/env';

/**
 * Projects:
 *  - setup         logs in once via API and stores session + api key in .auth/
 *  - api           API specs (tests/api), no browser, fully parallel
 *  - api-stateful  API specs tagged @stateful (shared account basket), one worker
 *  - e2e-chromium  UI specs (tests/e2e) + agent seed, authenticated via storageState
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 4 : undefined,
  timeout: TIMEOUTS.test,
  expect: { timeout: TIMEOUTS.expect },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: true }],
  ],
  use: {
    baseURL: env.baseURL,
    actionTimeout: TIMEOUTS.action,
    navigationTimeout: TIMEOUTS.navigation,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup[\\/].+\.setup\.ts$/,
    },
    {
      name: 'api',
      testMatch: /api[\\/].+\.api\.spec\.ts$/,
      grepInvert: new RegExp(TAGS.stateful),
      dependencies: ['setup'],
    },
    {
      // The basket is account-wide: tests that touch it (basket, orders) run one at a time.
      name: 'api-stateful',
      testMatch: /api[\\/].+\.api\.spec\.ts$/,
      grep: new RegExp(TAGS.stateful),
      workers: 1,
      dependencies: ['setup'],
    },
    {
      name: 'e2e-chromium',
      testMatch: /(e2e[\\/].+\.spec\.ts|seed\.spec\.ts)$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: AUTH.storageState,
      },
    },
  ],
});
