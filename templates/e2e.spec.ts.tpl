import { expect, test } from '@fixtures';
import { TAGS } from '@config/constants';

test.describe('__FEATURE__', () => {
  test.beforeEach(async ({ allure }) => {
    await allure.labels({ epic: 'Market', feature: '__FEATURE__', owner: 'qa' });
  });

  test('should <behaviour> when <condition>', { tag: [TAGS.e2e, TAGS.smoke] }, async ({ seeder, marketPage }) => {
    // Arrange: seed via API, never via UI
    const product = await seeder.seedProduct();

    // Act
    await marketPage.open();
    await marketPage.products.search(product.product_name);

    // Assert
    await expect(marketPage.products.card(product.product_name)).toBeVisible();
  });
});
