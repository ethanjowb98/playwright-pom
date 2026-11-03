import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels } from '@utils/allure';

test.describe('__FEATURE__', { tag: [TAGS.e2e] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: '__FEATURE__' });
  });

  test('should <behaviour> when <condition>', { tag: [TAGS.smoke] }, async ({ seeder, marketPage }) => {
    // Arrange: seed via API, never via UI
    const product = await seeder.seedProduct();

    // Act
    await marketPage.open();
    await marketPage.products.search(product.product_name);

    // Assert
    await expect(marketPage.products.card(product.product_name)).toBeVisible();
  });
});
