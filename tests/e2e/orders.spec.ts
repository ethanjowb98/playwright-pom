import { TAGS, TERMINAL_ORDER_STATUSES } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';
import { money } from '@utils/format';

// Seeding an order consumes the account-wide basket: single-worker stateful project.
test.describe('Orders UI', { tag: [TAGS.e2e, TAGS.stateful] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Orders' });
  });

  test(
    'should list the order with its items and total when the Orders tab is opened',
    { tag: [TAGS.smoke] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Read', severity: Severity.CRITICAL });
      const { order, lines } = await seeder.seedOrder({ items: 2 });
      await marketPage.open();

      const orders = await marketPage.openOrders();
      await orders.expand(order.order_number);

      await expect(orders.status(order.order_number)).toHaveText('pending');
      await expect(orders.total(order.order_number)).toHaveText(money(order.total_amount));
      await expect(orders.items(order.order_number)).toHaveCount(lines.length);
      for (const { product, quantity } of lines) {
        await expect(
          orders.items(order.order_number).filter({ hasText: product.product_name }),
        ).toContainText(`× ${quantity}`);
      }
    },
  );

  test(
    'should save the status when an open status is selected',
    { tag: [TAGS.smoke] },
    async ({ seeder, ordersApi, marketPage }) => {
      await labels({ story: 'Update status', severity: Severity.CRITICAL });
      const { order } = await seeder.seedOrder();
      await marketPage.open();
      const orders = await marketPage.openOrders();

      await orders.changeStatus(order.order_number, 'processing');

      await expect(orders.status(order.order_number)).toHaveText('processing');
      expect((await ordersApi.getById(order.id)).status).toBe('processing');
    },
  );

  for (const status of TERMINAL_ORDER_STATUSES) {
    test(
      `should lock the order when ${status} is confirmed`,
      { tag: [TAGS.regression] },
      async ({ seeder, ordersApi, marketPage }) => {
        await labels({ story: 'Update status', severity: Severity.CRITICAL });
        const { order } = await seeder.seedOrder();
        await marketPage.open();
        const orders = await marketPage.openOrders();

        await orders.changeStatus(order.order_number, status);

        await expect(orders.status(order.order_number)).toHaveText(status);
        await orders.expand(order.order_number);
        await expect(orders.statusSelect(order.order_number)).toBeDisabled();
        expect((await ordersApi.getById(order.id)).status).toBe(status);
      },
    );
  }

  test(
    'should return the items to stock when the order is cancelled',
    { tag: [TAGS.regression] },
    async ({ seeder, productsApi, marketPage }) => {
      await labels({ story: 'Cancel', severity: Severity.CRITICAL });
      const { order, lines } = await seeder.seedOrder({ items: 2 });
      await marketPage.open();
      const orders = await marketPage.openOrders();

      await orders.changeStatus(order.order_number, 'cancelled');

      await expect(orders.status(order.order_number)).toHaveText('cancelled');
      for (const { product } of lines) {
        expect((await productsApi.getById(product.id)).stock).toBe(product.stock);
      }
    },
  );

  test(
    'should keep the status when the final status warning is cancelled',
    { tag: [TAGS.regression] },
    async ({ seeder, ordersApi, marketPage }) => {
      await labels({ story: 'Update status', severity: Severity.NORMAL });
      const { order } = await seeder.seedOrder();
      await marketPage.open();
      const orders = await marketPage.openOrders();

      await orders.abandonStatusChange(order.order_number, 'delivered');

      await expect(orders.statusSelect(order.order_number)).toHaveValue('pending');
      await expect(orders.status(order.order_number)).toHaveText('pending');
      expect((await ordersApi.getById(order.id)).status).toBe('pending');
    },
  );

  test(
    'should remove the order when the delete is confirmed',
    { tag: [TAGS.smoke] },
    async ({ seeder, ordersApi, marketPage }) => {
      await labels({ story: 'Delete', severity: Severity.CRITICAL });
      const { order } = await seeder.seedOrder();
      await marketPage.open();
      const orders = await marketPage.openOrders();

      await orders.deleteOrder(order.order_number);

      await expect(orders.card(order.order_number)).toHaveCount(0);
      await expect(ordersApi.getById(order.id)).rejects.toMatchObject({ status: 404 });
    },
  );
});
