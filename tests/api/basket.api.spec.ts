import { type BasketApi } from '@api/BasketApi';
import { TAGS, TEST_DATA } from '@config/constants';
import { type BasketSeed } from '@data/DataSeeder';
import { expect, test } from '@fixtures';
import { labels, productDefect, Severity } from '@utils/allure';

const LOW_STOCK = 2;
const RACING_QUANTITIES = [1, 2, 3, 4, 5];

/** Quantity of `productId` in the basket, or undefined when it is not there. */
async function quantityOf(basketApi: BasketApi, productId: string): Promise<number | undefined> {
  return (await basketApi.list()).find((item) => item.product_id === productId)?.quantity;
}

const overStockAfterAdd: {
  condition: string;
  initial: number;
  act: (api: BasketApi, productId: string) => Promise<unknown>;
}[] = [
  {
    condition: 'an increment exceeds stock',
    initial: LOW_STOCK,
    act: (api, productId) => api.add(productId, 1),
  },
  {
    condition: 'an update exceeds stock',
    initial: 1,
    act: (api, productId) => api.setQuantity(productId, LOW_STOCK + 1),
  },
];

// The basket is account-wide, so this whole file runs in the single-worker stateful project.
test.describe('Basket API', { tag: [TAGS.api, TAGS.stateful] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Basket' });
  });

  test.describe('Create and update', () => {
    test(
      'should add a product to the basket when it is in stock',
      { tag: [TAGS.smoke] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Add item', severity: Severity.BLOCKER });
        const product = await seeder.seedProduct();

        const line = await seeder.addToBasket(product.id, 2);

        expect(line).toMatchObject({ product_id: product.id, quantity: 2 });
        expect(await basketApi.list()).toContainEqual(
          expect.objectContaining({
            product_id: product.id,
            product_name: product.product_name,
            price: product.price,
            quantity: 2,
          }),
        );
      },
    );

    test(
      'should increase the quantity when the same product is added again',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Add item', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();
        await seeder.addToBasket(product.id, 1);

        await basketApi.add(product.id, 2);

        expect(await quantityOf(basketApi, product.id)).toBe(3);
      },
    );

    test(
      'should set the quantity when a basket item is updated',
      { tag: [TAGS.smoke] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Update quantity', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();
        await seeder.addToBasket(product.id, 1);

        const line = await basketApi.setQuantity(product.id, 3);

        expect(line.quantity).toBe(3);
        expect(await quantityOf(basketApi, product.id)).toBe(3);
      },
    );
  });

  test.describe('Delete', () => {
    test(
      'should remove only that item when a basket item is removed',
      { tag: [TAGS.smoke] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Remove item', severity: Severity.CRITICAL });
        const [removed, kept] = (await seeder.seedBasket({ items: 2 })) as [BasketSeed, BasketSeed];

        await basketApi.remove(removed.product.id);

        const productIds = (await basketApi.list()).map(({ product_id }) => product_id);
        expect(productIds).not.toContain(removed.product.id);
        expect(productIds).toContain(kept.product.id);
      },
    );

    test(
      'should empty the basket when it is cleared',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Clear', severity: Severity.NORMAL });
        await seeder.seedBasket({ items: 2 });

        await basketApi.clear();

        expect(await basketApi.list()).toEqual([]);
      },
    );

    test(
      'should drop the item from the basket when its product is deleted',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi, productsApi }) => {
        await labels({ story: 'Remove item', severity: Severity.NORMAL });
        const [line] = (await seeder.seedBasket()) as [BasketSeed];

        await productsApi.remove(line.product.id);

        expect(await quantityOf(basketApi, line.product.id)).toBeUndefined();
      },
    );
  });

  test.describe('Validation', () => {
    test(
      'should reject the item with 400 when the quantity exceeds stock',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Stock limit', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct({ stock: LOW_STOCK });

        await expect(seeder.addToBasket(product.id, LOW_STOCK + 1)).rejects.toMatchObject({
          status: 400,
        });

        expect(await quantityOf(basketApi, product.id)).toBeUndefined();
      },
    );

    for (const { condition, initial, act } of overStockAfterAdd) {
      test(
        `should reject the change with 400 and keep the quantity when ${condition}`,
        { tag: [TAGS.regression] },
        async ({ seeder, basketApi }) => {
          await labels({ story: 'Stock limit', severity: Severity.CRITICAL });
          const product = await seeder.seedProduct({ stock: LOW_STOCK });
          await seeder.addToBasket(product.id, initial);

          await expect(act(basketApi, product.id)).rejects.toMatchObject({ status: 400 });

          expect(await quantityOf(basketApi, product.id)).toBe(initial);
        },
      );
    }

    for (const quantity of [0, -1]) {
      test(
        `should reject the item with 400 when the quantity is ${quantity}`,
        { tag: [TAGS.regression] },
        async ({ seeder }) => {
          await labels({ story: 'Add item validation', severity: Severity.NORMAL });
          const product = await seeder.seedProduct();

          await expect(seeder.addToBasket(product.id, quantity)).rejects.toMatchObject({
            status: 400,
          });
        },
      );
    }

    test(
      'should reject the item with 400 when product_id is missing',
      { tag: [TAGS.regression] },
      async ({ basketApi }) => {
        await labels({ story: 'Add item validation', severity: Severity.NORMAL });

        await expect(basketApi.addRaw({ quantity: 1 })).rejects.toMatchObject({ status: 400 });
      },
    );

    test(
      'should return 404 when an unknown product is added',
      { tag: [TAGS.regression] },
      async ({ basketApi }) => {
        await labels({ story: 'Not found', severity: Severity.NORMAL });

        await expect(basketApi.add(TEST_DATA.unknownId, 1)).rejects.toMatchObject({
          status: 404,
        });
      },
    );

    test(
      'should return 404 when a product that is not in the basket is updated',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Not found', severity: Severity.NORMAL });
        const product = await seeder.seedProduct();

        await expect(basketApi.setQuantity(product.id, 1)).rejects.toMatchObject({
          status: 404,
        });
      },
    );

    test(
      'should return 404 when a product that is not in the basket is removed',
      { tag: [TAGS.regression] },
      async ({ basketApi }) => {
        await labels({ story: 'Not found', severity: Severity.NORMAL });

        await expect(basketApi.remove(TEST_DATA.unknownId)).rejects.toMatchObject({
          status: 404,
        });
      },
    );
  });

  test.describe('Isolation', () => {
    test(
      'should keep one line with one of the requested quantities when updates race',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Concurrency', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();
        await seeder.addToBasket(product.id, 1);

        await Promise.all(RACING_QUANTITIES.map((q) => basketApi.setQuantity(product.id, q)));

        const lines = (await basketApi.list()).filter((item) => item.product_id === product.id);
        expect(lines).toHaveLength(1);
        expect(RACING_QUANTITIES).toContain(lines[0]?.quantity);
      },
    );

    test.fixme(
      'should count every unit when the same product is added concurrently',
      {
        tag: [TAGS.regression],
        annotation: productDefect(
          'Basket',
          'concurrent POST /api/basket for one product returns 500 for some requests',
        ),
      },
      async ({ seeder, basketApi }) => {
        await labels({ story: 'Concurrency', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();
        seeder.trackBasketItem(product.id);

        await Promise.all(RACING_QUANTITIES.map(() => basketApi.add(product.id, 1)));

        expect(await quantityOf(basketApi, product.id)).toBe(RACING_QUANTITIES.length);
      },
    );
  });
});
