import { expect, test } from '@playwright/test';

import { ROUTES, TAGS } from '@config/constants';

// Seed for the Playwright test agents (planner / generator / healer): an authenticated Market page.
// M4 switches this to the `marketPage` fixture so generated tests start from the page objects.
test.describe('Market seed', () => {
  test(
    'should open the market when the user is authenticated',
    { tag: [TAGS.e2e, TAGS.smoke] },
    async ({ page }) => {
      await page.goto(ROUTES.market);

      await expect(page).toHaveURL(new RegExp(`${ROUTES.market}$`));
      await expect(page.locator('#headerUsername')).not.toBeEmpty();
      await expect(page.locator('#productsGrid')).toBeVisible();
    },
  );
});
