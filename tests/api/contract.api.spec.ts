import { type DocumentedApi } from '@api/DocumentedApi';
import { type BasketItem } from '@api/types';
import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, productDefect, Severity } from '@utils/allure';

/** Documented basket operations on a seeded line of quantity 1; `expected` is the line's quantities after. */
const documentedBasketCalls: {
  action: string;
  act: (api: DocumentedApi, itemId: string) => Promise<unknown>;
  expected: number[];
}[] = [
  {
    action: 'update a basket item',
    act: (api, itemId) => api.updateBasketItem(itemId, 2),
    expected: [2],
  },
  {
    action: 'remove a basket item',
    act: (api, itemId) => api.removeBasketItem(itemId),
    expected: [],
  },
  { action: 'clear the basket', act: (api) => api.clearBasket(), expected: [] },
];

/** The documented item paths take the basket item's own id, not the product id. */
function basketItemId(items: BasketItem[], productId: string): string {
  const item = items.find((line) => line.product_id === productId);
  if (!item) throw new Error('The seeded basket line is missing');
  return item.id;
}

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

  test.fixme(
    'should add a basket item at the documented basket items path when it is called',
    {
      tag: [TAGS.regression, TAGS.stateful],
      annotation: productDefect(
        'API contract',
        'the documented POST /api/basket/items returns 404; only /api/basket exists',
      ),
    },
    async ({ seeder, documentedApi }) => {
      await labels({ story: 'Documented paths', severity: Severity.NORMAL });
      const product = await seeder.seedProduct();
      seeder.trackBasketItem(product.id);

      const line = await documentedApi.addBasketItem(product.id, 1);

      expect(line).toMatchObject({ product_id: product.id, quantity: 1 });
    },
  );

  for (const { action, act, expected } of documentedBasketCalls) {
    test.fixme(
      `should ${action} when the documented basket path is used`,
      {
        tag: [TAGS.regression, TAGS.stateful],
        annotation: productDefect(
          'API contract',
          'the documented DELETE /api/basket and PUT / DELETE /api/basket/items/{id} return 404; the UI uses /api/basket/clear and /api/basket',
        ),
      },
      async ({ seeder, basketApi, documentedApi }) => {
        await labels({ story: 'Documented paths', severity: Severity.NORMAL });
        const { product } = await seeder.seedBasketLine(1);
        const itemId = basketItemId(await basketApi.list(), product.id);

        await act(documentedApi, itemId);

        expect((await basketApi.list()).filter((line) => line.product_id === product.id)).toEqual(
          expected.map((quantity) => expect.objectContaining({ quantity })),
        );
      },
    );
  }
});
