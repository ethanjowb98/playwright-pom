import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels } from '@utils/allure';

// Add TAGS.stateful to the describe tags if the spec touches the account-wide basket or orders.
test.describe('__FEATURE__', { tag: [TAGS.e2e] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: '__FEATURE__' });
  });

  test('should <behaviour> when <condition>', { tag: [TAGS.smoke] }, async ({ seeder, marketPage }) => {
    // Arrange: seed via API, never via UI. Data the UI will create is registered here, before the action:
    // seeder.expectProductNamed(name) / seeder.expectOrderWith(productNames).
    const product = await seeder.seedProduct();

    // Act
    await marketPage.open();
    await marketPage.products.searchFor(product.product_name);

    // Assert
    await expect(marketPage.products.card(product.product_name)).toBeVisible();
  });
});
