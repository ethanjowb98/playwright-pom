import { type ProductsApi } from '@api/ProductsApi';
import { TAGS, TEMPERATURE_ZONES, TEST_DATA } from '@config/constants';
import { buildProduct } from '@data/factories/productFactory';
import { expect, test } from '@fixtures';
import { labels, productDefect, Severity } from '@utils/allure';
import { expectProductShape } from '@utils/assertions';
import { roundMoney } from '@utils/format';

/** A valid product payload without one field, for "missing field" cases. */
function productWithout(field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(buildProduct()).filter(([key]) => key !== field));
}

const invalidPayloads: { condition: string; payload: () => Record<string, unknown> }[] = [
  { condition: 'product_name is missing', payload: () => productWithout('product_name') },
  { condition: 'product_name is empty', payload: () => ({ ...buildProduct(), product_name: '' }) },
  { condition: 'category is missing', payload: () => productWithout('category') },
  { condition: 'price is missing', payload: () => productWithout('price') },
  { condition: 'price is not a number', payload: () => ({ ...buildProduct(), price: 'abc' }) },
  { condition: 'stock is not a number', payload: () => ({ ...buildProduct(), stock: 'x' }) },
  { condition: 'stock is not an integer', payload: () => ({ ...buildProduct(), stock: 1.5 }) },
  { condition: 'stock is negative', payload: () => ({ ...buildProduct(), stock: -5 }) },
  {
    condition: 'temperature_zone is not a known zone',
    payload: () => ({ ...buildProduct(), temperature_zone: 'Hot' }),
  },
];

/** Update payloads the API rejects with 400 and the product must stay as it was. */
const invalidUpdates: { condition: string; payload: Record<string, unknown> }[] = [
  { condition: 'price is not a number', payload: { price: 'abc' } },
  { condition: 'stock is negative', payload: { stock: -5 } },
  { condition: 'stock is not a number', payload: { stock: 'x' } },
  { condition: 'stock is not an integer', payload: { stock: 1.5 } },
];

/** Update payloads the API wrongly saves (product defect): `POST` rejects them, `PUT` does not. */
const acceptedInvalidUpdates: { condition: string; payload: Record<string, unknown> }[] = [
  { condition: 'price is zero', payload: { price: 0 } },
  { condition: 'price is negative', payload: { price: -1 } },
];

const unknownProductCalls: { action: string; call: (api: ProductsApi) => Promise<unknown> }[] = [
  { action: 'fetched', call: (api) => api.getById(TEST_DATA.unknownId) },
  { action: 'updated', call: (api) => api.update(TEST_DATA.unknownId, { price: 1 }) },
  { action: 'deleted', call: (api) => api.remove(TEST_DATA.unknownId) },
];

test.describe('Products API', { tag: [TAGS.api] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Products' });
  });

  test.describe('Create', () => {
    test(
      'should create a product when the payload is valid',
      { tag: [TAGS.smoke] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Create', severity: Severity.BLOCKER });
        // Arrange
        const input = buildProduct();

        // Act
        const created = seeder.trackProduct(await productsApi.create(input));

        // Assert (durability: re-read)
        expectProductShape(created, input);
        expect(await productsApi.getById(created.id)).toEqual(created);
      },
    );

    for (const [index, zone] of TEMPERATURE_ZONES.entries()) {
      const weighted = index % 2 === 0;

      test(
        `should store zone ${zone} and weighted ${weighted} when they are provided`,
        { tag: [TAGS.regression] },
        async ({ seeder, productsApi }) => {
          await labels({ story: 'Create', severity: Severity.NORMAL });
          const input = buildProduct({ temperature_zone: zone, weighted });

          const created = seeder.trackProduct(await productsApi.create(input));

          expect(await productsApi.getById(created.id)).toMatchObject({
            temperature_zone: zone,
            weighted,
          });
        },
      );
    }

    for (const { condition, payload } of invalidPayloads) {
      test(
        `should reject the product with 400 when ${condition}`,
        { tag: [TAGS.regression] },
        async ({ seeder, productsApi }) => {
          await labels({ story: 'Create validation', severity: Severity.NORMAL });

          const attempt = productsApi.createRaw(payload()).then((p) => seeder.trackProduct(p));

          await expect(attempt).rejects.toMatchObject({ status: 400 });
        },
      );
    }

    test.fixme(
      'should reject the product with 400 when price is negative',
      {
        tag: [TAGS.regression],
        annotation: productDefect(
          'Products',
          'POST /api/products accepts a negative price and returns 201',
        ),
      },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Create validation', severity: Severity.CRITICAL });

        const attempt = productsApi
          .create(buildProduct({ price: -1 }))
          .then((p) => seeder.trackProduct(p));

        await expect(attempt).rejects.toMatchObject({ status: 400 });
      },
    );
  });

  test.describe('Read', () => {
    test(
      'should return the product when it is fetched by id',
      { tag: [TAGS.smoke] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Read', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();

        const fetched = await productsApi.getById(product.id);

        expect(fetched).toEqual(product);
      },
    );

    test(
      'should include the product in the catalogue when it exists',
      { tag: [TAGS.regression] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Read', severity: Severity.NORMAL });
        const product = await seeder.seedProduct();

        const catalogue = await productsApi.list();

        expect(catalogue).toContainEqual(product);
      },
    );
  });

  test.describe('Update', () => {
    test(
      'should change only the sent fields when a partial payload is sent',
      { tag: [TAGS.smoke] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Update', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();
        const changes = { price: roundMoney(product.price + 1), stock: product.stock + 1 };

        const updated = await productsApi.update(product.id, changes);

        const expected = { ...product, ...changes };
        expect(updated).toEqual(expected);
        expect(await productsApi.getById(product.id)).toEqual(expected);
      },
    );

    for (const { condition, payload } of invalidUpdates) {
      test(
        `should reject the update with 400 and keep the product when ${condition}`,
        { tag: [TAGS.regression] },
        async ({ seeder, productsApi }) => {
          await labels({ story: 'Update validation', severity: Severity.NORMAL });
          const product = await seeder.seedProduct();

          await expect(productsApi.updateRaw(product.id, payload)).rejects.toMatchObject({
            status: 400,
          });

          expect(await productsApi.getById(product.id)).toEqual(product);
        },
      );
    }

    for (const { condition, payload } of acceptedInvalidUpdates) {
      test.fixme(
        `should reject the update with 400 and keep the product when ${condition}`,
        {
          tag: [TAGS.regression],
          annotation: productDefect(
            'Products',
            'PUT /api/products/:id saves a price of 0 or below (200), while POST rejects 0',
          ),
        },
        async ({ seeder, productsApi }) => {
          await labels({ story: 'Update validation', severity: Severity.CRITICAL });
          const product = await seeder.seedProduct();

          await expect(productsApi.updateRaw(product.id, payload)).rejects.toMatchObject({
            status: 400,
          });

          expect(await productsApi.getById(product.id)).toEqual(product);
        },
      );
    }
  });

  test.describe('Delete', () => {
    test(
      'should remove the product when it is deleted',
      { tag: [TAGS.smoke] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Delete', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct();

        await productsApi.remove(product.id);

        await expect(productsApi.getById(product.id)).rejects.toMatchObject({ status: 404 });
        expect((await productsApi.list()).map(({ id }) => id)).not.toContain(product.id);
      },
    );
  });

  for (const { action, call } of unknownProductCalls) {
    test(
      `should return 404 when an unknown product is ${action}`,
      { tag: [TAGS.regression] },
      async ({ productsApi }) => {
        await labels({ story: 'Not found', severity: Severity.NORMAL });

        await expect(call(productsApi)).rejects.toMatchObject({ status: 404 });
      },
    );
  }
});
