import { defineConfig, devices } from '@playwright/test';

import { ALLURE_CATEGORIES } from './src/config/allureCategories';
import { ALLURE, AUTH, TAGS, TIMEOUTS } from './src/config/constants';
import { env } from './src/config/env';

/**
 * Authenticated desktop Chrome, shared by the UI projects. Its storageState also reaches the built-in
 * `request` fixture, which is why API clients use the cookie-less `apiRequest` fixture instead.
 */
const browser = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1920, height: 1080 },
  storageState: AUTH.storageState,
};

/**
 * Projects:
 *  - setup         reuses the saved .auth/ session if still valid, else logs in via API
 *  - api           API specs (tests/api), no browser, fully parallel
 *  - stateful      API + UI specs tagged @stateful (shared account basket), one worker, so API and UI
 *                  basket/order tests never overlap. npm scripts narrow it with --grep @api / @e2e.
 *  - e2e-chromium  UI specs (tests/e2e) + agent seed, authenticated via storageState, fully parallel
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
    // Clears allure-results/ and writes environment.properties + executor.json before allure-playwright runs.
    ['./src/reporters/AllureRunInfo.ts'],
    [
      'allure-playwright',
      {
        resultsDir: ALLURE.resultsDir,
        detail: true,
        suiteTitle: true,
        categories: ALLURE_CATEGORIES,
      },
    ],
    // Last, so it can scan what the reporters above wrote: fails the run if a secret reached a report.
    ['./src/reporters/SecretGuard.ts'],
  ],
  use: {
    baseURL: env.baseURL,
    actionTimeout: TIMEOUTS.action,
    navigationTimeout: TIMEOUTS.navigation,
    // Off everywhere: every request context is traced (the seeder's included), so a trace would carry
    // the `Authorization: <api key>` header into the uploaded report. Screenshots, video and the Allure
    // steps with request/response attachments are the debugging artefacts.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // No retries: a retry spends another rate-limited login.
      name: 'setup',
      testMatch: /setup[\\/].+\.setup\.ts$/,
      retries: 0,
    },
    {
      name: 'api',
      testMatch: /api[\\/].+\.api\.spec\.ts$/,
      grepInvert: new RegExp(TAGS.stateful),
      dependencies: ['setup'],
    },
    {
      // The basket is account-wide: every test that touches it (API or UI) runs one at a time, here.
      name: 'stateful',
      testMatch: /(api[\\/].+\.api\.spec\.ts|e2e[\\/].+\.spec\.ts)$/,
      grep: new RegExp(TAGS.stateful),
      workers: 1,
      dependencies: ['setup'],
      use: browser,
    },
    {
      name: 'e2e-chromium',
      testMatch: /(e2e[\\/].+\.spec\.ts|seed\.spec\.ts)$/,
      grepInvert: new RegExp(TAGS.stateful),
      dependencies: ['setup'],
      use: browser,
    },
  ],
});
