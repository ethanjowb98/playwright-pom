import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';

// Swagger (/market/docs) documents /api/groceries and /api/basket/items; the UI calls /api/products and /api/basket.
test.describe('API contract', { tag: [TAGS.api] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'API contract' });
  });

  test(
    'should serve the product catalogue at the documented groceries path when it is called',
    { tag: [TAGS.regression] },
    async ({ seeder, documentedApi }) => {
      await labels({ story: 'Documented paths', severity: Severity.NORMAL });
      const product = await seeder.seedProduct();

      const groceries = await documentedApi.listGroceries();

      expect(groceries).toContainEqual(product);
    },
  );

  // PRODUCT DEFECT: the documented POST /api/basket/items returns 404; only /api/basket exists (see ROADMAP notes).
  test.fixme(
    'should add a basket item at the documented basket items path when it is called',
    { tag: [TAGS.regression, TAGS.stateful] },
    async ({ seeder, documentedApi }) => {
      await labels({ story: 'Documented paths', severity: Severity.NORMAL });
      const product = await seeder.seedProduct();
      seeder.trackBasketItem(product.id);

      const line = await documentedApi.addBasketItem(product.id, 1);

      expect(line).toMatchObject({ product_id: product.id, quantity: 1 });
    },
  );
});
