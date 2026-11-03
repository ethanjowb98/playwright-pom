import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';

// Seed for the Playwright test agents (planner / generator / healer): an authenticated Market page,
// opened through the `marketPage` fixture so generated tests start from the page objects.
test.describe('Market seed', () => {
  test(
    'should open the market when the user is authenticated',
    { tag: [TAGS.e2e, TAGS.smoke] },
    async ({ marketPage }) => {
      await labels({ feature: 'Market', story: 'Open', severity: Severity.BLOCKER });
      await marketPage.open();

      await expect(marketPage.username).not.toBeEmpty();
      await expect(marketPage.products.root).toBeVisible();
    },
  );
});
