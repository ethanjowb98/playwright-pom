import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';
import { expectOrderTotals } from '@utils/assertions';
import { money } from '@utils/format';

// Placing an order consumes the account-wide basket: single-worker stateful project.
test.describe('Checkout UI', { tag: [TAGS.e2e, TAGS.stateful] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Checkout' });
  });

  test(
    'should place the order, list it in Orders and empty the basket when the basket is checked out',
    { tag: [TAGS.smoke] },
    async ({ seeder, basketApi, ordersApi, productsApi, marketPage }) => {
      await labels({ story: 'Place order', severity: Severity.BLOCKER });
      const lines = await seeder.seedBasket({ items: 2 });
      seeder.expectOrderWith(lines.map(({ product }) => product.product_name));
      await marketPage.open();
      const basket = await marketPage.openBasket();

      const placed = seeder.trackOrder(await basket.placeOrder());

      // The success modal and the API agree on the order
      const { orderSuccess } = marketPage;
      await expect(orderSuccess.root).toBeVisible();
      await expect(orderSuccess.orderNumber).toHaveText(placed.order_number);
      const order = await ordersApi.getById(placed.id);
      expectOrderTotals(order, lines);
      await expect(orderSuccess.total).toHaveText(money(order.total_amount));
      await expect(orderSuccess.items).toHaveCount(lines.length);

      // It is listed in Orders as pending
      await orderSuccess.viewOrders();
      const { orders } = marketPage;
      await expect(orders.status(order.order_number)).toHaveText('pending');
      await expect(orders.total(order.order_number)).toHaveText(money(order.total_amount));

      // Consistency: basket emptied, stock decreased by the quantity ordered
      await expect(marketPage.basketBadge).toHaveText('0');
      expect(await basketApi.list()).toEqual([]);
      for (const { product, quantity } of lines) {
        expect((await productsApi.getById(product.id)).stock).toBe(product.stock - quantity);
      }
    },
  );

  test(
    'should show the reduced stock on the product card when an order has been placed',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Consistency', severity: Severity.NORMAL });
      const { product, quantity } = await seeder.seedBasketLine();
      seeder.expectOrderWith([product.product_name]);
      await marketPage.open();
      seeder.trackOrder(await (await marketPage.openBasket()).placeOrder());

      await marketPage.reload();

      await expect(marketPage.products.stock(product.product_name)).toHaveText(
        `${product.stock - quantity} in stock`,
      );
      await expect(marketPage.products.addButton(product.product_name)).toBeVisible();
    },
  );
});
