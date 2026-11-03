import { defineConfig, devices } from '@playwright/test';

import { AUTH, TIMEOUTS } from './src/config/constants';
import { env } from './src/config/env';

/**
 * Projects:
 *  - setup         logs in once via API and stores session + api key in .auth/
 *  - api           API specs (tests/api), no browser
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
