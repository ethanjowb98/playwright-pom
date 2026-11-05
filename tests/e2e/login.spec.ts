import { faker } from '@faker-js/faker';

import { ROUTES, TAGS } from '@config/constants';
import { env } from '@config/env';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';

// No artefacts: the profile page these tests land on is driven by `GET /api/profile`, which returns the
// api key, and screenshots and videos are outside SecretGuard's reach. The fixture's page snapshot in
// error-context.md is off for the same reason (PLAYWRIGHT_NO_COPY_PROMPT in playwright.config.ts), but a
// failed locator assertion still snapshots the page: never assert locators on the profile page.
test.use({ video: 'off', screenshot: 'off' });

// POST /api/login allows 10 requests per 15 min per IP; each @login test below spends one, so keep them few.
test.describe('Login', { tag: [TAGS.e2e] }, () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  // A retry would spend another login.
  test.describe.configure({ retries: 0 });

  test.beforeEach(async () => {
    await labels({ feature: 'Login' });
  });

  test(
    'should land on the profile and open the market when the credentials are valid',
    { tag: [TAGS.smoke, TAGS.login] },
    async ({ page, loginPage, marketPage }) => {
      await labels({ story: 'Login', severity: Severity.BLOCKER });
      await loginPage.open();

      await loginPage.login(env.username, env.password);

      await expect(page).toHaveURL((url) => url.pathname === ROUTES.profile);
      await marketPage.open();
      await expect(marketPage.username).not.toBeEmpty();
    },
  );

  test(
    'should show an error and stay on the home page when the password is wrong',
    { tag: [TAGS.regression, TAGS.login] },
    async ({ page, loginPage }) => {
      await labels({ story: 'Login', severity: Severity.CRITICAL });
      await loginPage.open();

      await loginPage.login(env.username, faker.internet.password());

      await expect(loginPage.error).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === ROUTES.home);
    },
  );

  // Not @login: the browser blocks the empty submit, so no login request is sent.
  test(
    'should block the submit and stay on the home page when the login form is empty',
    { tag: [TAGS.regression] },
    async ({ page, loginPage }) => {
      await labels({ story: 'Login validation', severity: Severity.NORMAL });
      await loginPage.open();

      await loginPage.submitEmpty();

      expect(await loginPage.validationMessage(loginPage.username)).not.toBe('');
      await expect(loginPage.authModal).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === ROUTES.home);
    },
  );

  test(
    'should redirect to the home page when the market is opened without a session',
    { tag: [TAGS.regression] },
    async ({ page, loginPage, marketPage }) => {
      await labels({ story: 'Session', severity: Severity.CRITICAL });

      await marketPage.navigate();

      await expect(page).toHaveURL((url) => url.pathname === ROUTES.home);
      await expect(loginPage.openAuthButton).toBeVisible();
    },
  );
});
