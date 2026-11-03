import * as allure from 'allure-js-commons';

import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';

// Proves the M2 data layer: everything DataSeeder creates is readable, and gone after cleanup.
test.describe('Test data seeding', () => {
  test.beforeEach(async () => {
    await allure.epic('Market');
    await allure.feature('Test data');
    await allure.severity(allure.Severity.CRITICAL);
  });

  test(
    'should delete seeded products when the seeder cleans up',
    { tag: [TAGS.api, TAGS.smoke] },
    async ({ seeder, productsApi }) => {
      await allure.story('Product seeding');

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
      await allure.story('Order seeding');

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
