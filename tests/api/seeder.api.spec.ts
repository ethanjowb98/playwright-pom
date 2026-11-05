import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';

// Proves the data layer: everything DataSeeder creates is readable, and gone after cleanup.
test.describe('Test data seeding', () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Test data', severity: Severity.CRITICAL });
  });

  test(
    'should delete seeded products when the seeder cleans up',
    { tag: [TAGS.api, TAGS.smoke] },
    async ({ seeder, productsApi }) => {
      await labels({ story: 'Product seeding' });

      // Arrange
      const seeded = await seeder.seedProducts(2);
      for (const product of seeded) {
        expect(await productsApi.getById(product.id)).toEqual(product);
      }

      // Act
      await seeder.cleanup();

      // Assert
      for (const { id } of seeded) {
        await expect(productsApi.getById(id)).rejects.toMatchObject({ status: 404 });
      }
    },
  );

  test(
    'should leave no order, basket item or product behind when a seeded order is cleaned up',
    { tag: [TAGS.api, TAGS.smoke, TAGS.stateful] },
    async ({ seeder, productsApi, basketApi, ordersApi }) => {
      await labels({ story: 'Order seeding' });

      // Arrange
      const { order, lines } = await seeder.seedOrder({ items: 2 });
      const productIds = lines.map(({ product }) => product.id);
      expect((await ordersApi.getById(order.id)).items.map((item) => item.product_id)).toEqual(
        expect.arrayContaining(productIds),
      );

      // Act
      await seeder.cleanup();

      // Assert
      await expect(ordersApi.getById(order.id)).rejects.toMatchObject({ status: 404 });
      for (const id of productIds) {
        await expect(productsApi.getById(id)).rejects.toMatchObject({ status: 404 });
      }
      const leftovers = (await basketApi.list()).filter((item) =>
        productIds.includes(item.product_id),
      );
      expect(leftovers).toEqual([]);
    },
  );
});
