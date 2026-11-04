import { type ProductsApi } from '@api/ProductsApi';
import { type Product } from '@api/types';
import { TAGS } from '@config/constants';
import { type BasketSeed } from '@data/DataSeeder';
import { expect, test } from '@fixtures';
import { labels, productDefect, Severity } from '@utils/allure';
import { expectOrderTotals } from '@utils/assertions';

const ORIGINAL_STOCK = 5;

async function stockOf(productsApi: ProductsApi, id: string): Promise<number> {
  return (await productsApi.getById(id)).stock;
}

// ACID invariants of checkout. Uses the account-wide basket: single-worker stateful project.
test.describe('Order integrity API', { tag: [TAGS.api, TAGS.stateful] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Order integrity' });
  });

  test(
    'should total the items, empty the basket and decrease stock when an order is placed',
    { tag: [TAGS.smoke] },
    async ({ seeder, ordersApi, basketApi, productsApi }) => {
      await labels({ story: 'Consistency', severity: Severity.BLOCKER });
      // Arrange
      const lines = await seeder.seedBasket({ items: 3 });

      // Act
      const order = seeder.trackOrder(await ordersApi.place());

      // Assert
      expectOrderTotals(order, lines);
      const basketIds = (await basketApi.list()).map(({ product_id }) => product_id);
      for (const { product, quantity } of lines) {
        expect(basketIds, `${product.product_name} left the basket`).not.toContain(product.id);
        expect(await stockOf(productsApi, product.id), `${product.product_name} stock`).toBe(
          product.stock - quantity,
        );
      }
    },
  );

  test(
    'should restore stock when an order is cancelled',
    { tag: [TAGS.regression] },
    async ({ seeder, ordersApi, productsApi }) => {
      await labels({ story: 'Consistency', severity: Severity.CRITICAL });
      const { order, lines } = await seeder.seedOrder();
      const [{ product }] = lines as [BasketSeed];

      await ordersApi.update(order.id, { status: 'cancelled' });

      expect(await stockOf(productsApi, product.id)).toBe(product.stock);
    },
  );

  test.fixme(
    'should reject the order and change nothing when stock fell below a basket quantity',
    {
      tag: [TAGS.regression],
      annotation: productDefect(
        'Order integrity',
        'POST /api/orders accepts a basket quantity above current stock, creates the order and clamps stock to 0',
      ),
    },
    async ({ seeder, ordersApi, basketApi, productsApi }) => {
      await labels({ story: 'Atomicity', severity: Severity.CRITICAL });
      // Arrange: two lines, then the second product's stock drops below its basket quantity
      const [inStock, oversold] = (await seeder.seedProducts(2, { stock: ORIGINAL_STOCK })) as [
        Product,
        Product,
      ];
      await seeder.addToBasket(inStock.id, 2);
      await seeder.addToBasket(oversold.id, 3);
      await productsApi.update(oversold.id, { stock: 1 });
      const ordersBefore = (await ordersApi.list()).length;

      // Act
      const attempt = ordersApi.place().then((order) => seeder.trackOrder(order));

      // Assert: rejected, and no partial state anywhere
      await expect(attempt).rejects.toMatchObject({ status: 400 });
      expect(await ordersApi.list()).toHaveLength(ordersBefore);
      expect(await stockOf(productsApi, inStock.id)).toBe(ORIGINAL_STOCK);
      expect(await stockOf(productsApi, oversold.id)).toBe(1);
      expect((await basketApi.list()).map(({ quantity }) => quantity).sort()).toEqual([2, 3]);
    },
  );
});
