import { type OrdersApi } from '@api/OrdersApi';
import { type OrderStatus } from '@api/types';
import { ORDER_STATUSES, TAGS, TEST_DATA } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';
import { expectOrderTotals } from '@utils/assertions';

/** Forward flow plus cancellation from every open state. */
const allowedTransitions: { from: OrderStatus; to: OrderStatus }[] = [
  { from: 'pending', to: 'processing' },
  { from: 'processing', to: 'shipped' },
  { from: 'shipped', to: 'delivered' },
  { from: 'pending', to: 'cancelled' },
  { from: 'processing', to: 'cancelled' },
  { from: 'shipped', to: 'cancelled' },
];

const terminalStatuses = (['delivered', 'cancelled'] as const).map((status) => ({
  status,
  others: ORDER_STATUSES.filter((other) => other !== status),
}));

const unknownOrderCalls: { action: string; call: (api: OrdersApi) => Promise<unknown> }[] = [
  { action: 'fetched', call: (api) => api.getById(TEST_DATA.unknownId) },
  { action: 'updated', call: (api) => api.update(TEST_DATA.unknownId, { status: 'shipped' }) },
  { action: 'deleted', call: (api) => api.remove(TEST_DATA.unknownId) },
];

// Placing an order consumes the account-wide basket: single-worker api-stateful project.
test.describe('Orders API', { tag: [TAGS.api, TAGS.stateful] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Orders' });
  });

  test.describe('Create', () => {
    test(
      'should place a pending order from the basket when the basket has items',
      { tag: [TAGS.smoke] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Place order', severity: Severity.BLOCKER });
        // Arrange
        const lines = await seeder.seedBasket({ items: 2 });

        // Act
        const order = seeder.trackOrder(await ordersApi.place('Leave at the door'));

        // Assert (durability: re-read)
        expect(order).toMatchObject({ status: 'pending', order_number: expect.any(String) });
        expectOrderTotals(order, lines);
        const fetched = await ordersApi.getById(order.id);
        expect(fetched).toMatchObject({
          id: order.id,
          notes: 'Leave at the door',
          total_amount: order.total_amount,
        });
        expectOrderTotals(fetched, lines);
      },
    );

    test(
      'should reject the order with 400 and create nothing when the basket is empty',
      { tag: [TAGS.regression] },
      async ({ basketApi, ordersApi }) => {
        await labels({ story: 'Place order', severity: Severity.CRITICAL });
        expect(await basketApi.list(), 'precondition: empty basket').toEqual([]);
        const ordersBefore = (await ordersApi.list()).length;

        await expect(ordersApi.place()).rejects.toMatchObject({ status: 400 });

        expect(await ordersApi.list()).toHaveLength(ordersBefore);
      },
    );
  });

  test.describe('Read', () => {
    test(
      'should return the order with its items when it is fetched by id',
      { tag: [TAGS.smoke] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Read', severity: Severity.CRITICAL });
        const { order, lines } = await seeder.seedOrder({ items: 2 });

        const fetched = await ordersApi.getById(order.id);

        expect(fetched.items.map(({ product_id }) => product_id).sort()).toEqual(
          lines.map(({ product }) => product.id).sort(),
        );
        expectOrderTotals(fetched, lines);
      },
    );

    test(
      'should list the order when it has been placed',
      { tag: [TAGS.regression] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Read', severity: Severity.NORMAL });
        const { order } = await seeder.seedOrder();

        const orders = await ordersApi.list();

        expect(orders).toContainEqual(
          expect.objectContaining({ id: order.id, order_number: order.order_number }),
        );
      },
    );
  });

  test.describe('Update', () => {
    for (const { from, to } of allowedTransitions) {
      test(
        `should move the order to ${to} when it is ${from}`,
        { tag: [TAGS.regression] },
        async ({ seeder, ordersApi }) => {
          await labels({ story: 'Status transitions', severity: Severity.CRITICAL });
          const { order } = await seeder.seedOrder({ status: from });

          const updated = await ordersApi.update(order.id, { status: to });

          expect(updated.status).toBe(to);
          expect((await ordersApi.getById(order.id)).status).toBe(to);
        },
      );
    }

    for (const { status, others } of terminalStatuses) {
      test(
        `should reject every status change with 400 when the order is ${status}`,
        { tag: [TAGS.regression] },
        async ({ seeder, ordersApi }) => {
          await labels({ story: 'Status transitions', severity: Severity.CRITICAL });
          const { order } = await seeder.seedOrder({ status });

          for (const next of others) {
            await expect(ordersApi.update(order.id, { status: next })).rejects.toMatchObject({
              status: 400,
            });
          }

          expect((await ordersApi.getById(order.id)).status).toBe(status);
        },
      );
    }

    test(
      'should save the notes when new notes are sent',
      { tag: [TAGS.regression] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Update notes', severity: Severity.NORMAL });
        const { order } = await seeder.seedOrder({ notes: 'original' });

        await ordersApi.update(order.id, { notes: 'updated' });

        expect(await ordersApi.getById(order.id)).toMatchObject({
          notes: 'updated',
          status: order.status,
        });
      },
    );

    test(
      'should reject the update with 400 when the status is not a known status',
      { tag: [TAGS.regression] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Update validation', severity: Severity.NORMAL });
        const { order } = await seeder.seedOrder();

        await expect(ordersApi.updateRaw(order.id, { status: 'lost' })).rejects.toMatchObject({
          status: 400,
        });

        expect((await ordersApi.getById(order.id)).status).toBe(order.status);
      },
    );

    test(
      'should reject the update with 400 when no fields are sent',
      { tag: [TAGS.regression] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Update validation', severity: Severity.MINOR });
        const { order } = await seeder.seedOrder();

        await expect(ordersApi.update(order.id, {})).rejects.toMatchObject({ status: 400 });
      },
    );
  });

  test.describe('Delete', () => {
    test(
      'should remove the order when it is deleted',
      { tag: [TAGS.smoke] },
      async ({ seeder, ordersApi }) => {
        await labels({ story: 'Delete', severity: Severity.CRITICAL });
        const { order } = await seeder.seedOrder();

        await ordersApi.remove(order.id);

        await expect(ordersApi.getById(order.id)).rejects.toMatchObject({ status: 404 });
      },
    );
  });

  for (const { action, call } of unknownOrderCalls) {
    test(
      `should return 404 when an unknown order is ${action}`,
      { tag: [TAGS.regression] },
      async ({ ordersApi }) => {
        await labels({ story: 'Not found', severity: Severity.NORMAL });

        await expect(call(ordersApi)).rejects.toMatchObject({ status: 404 });
      },
    );
  }
});
