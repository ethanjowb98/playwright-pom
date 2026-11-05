import { MAINTENANCE, TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { labels, productDefect, Severity } from '@utils/allure';

// POST /api/reset wipes every product, basket item and order of the account. This file runs only in
// the `maintenance` project (`npm run test:maintenance`), never with the rest of the suite or in CI.
test.describe('Maintenance API', { tag: [TAGS.api, TAGS.maintenance] }, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await labels({ feature: 'Maintenance' });
  });

  test(
    'should return 401 and change nothing when the reset has no api key',
    { tag: [TAGS.regression] },
    async ({ seeder, apiClientsFor, productsApi }) => {
      await labels({ story: 'Reset', severity: Severity.CRITICAL });
      const product = await seeder.seedProduct();
      const { maintenanceApi } = apiClientsFor(null);

      await expect(maintenanceApi.reset()).rejects.toMatchObject({ status: 401 });

      expect(await productsApi.getById(product.id)).toEqual(product);
    },
  );

  test(
    'should restore the template products and empty the basket and orders when the account is reset',
    { tag: [TAGS.regression] },
    async ({ seeder, maintenanceApi, productsApi, basketApi, ordersApi }) => {
      await labels({ story: 'Reset', severity: Severity.CRITICAL });
      const seeded = await seeder.seedProduct();
      await seeder.seedOrder();
      await seeder.seedBasketLine();

      const { products: restored } = await maintenanceApi.reset();

      // Durability: the account as re-read, not only what the reset response claims
      expect(await basketApi.list()).toEqual([]);
      expect(await ordersApi.list()).toEqual([]);
      const products = await productsApi.list();
      expect(products.map(({ id }) => id).sort()).toEqual(restored.map(({ id }) => id).sort());
      expect(products.map(({ id }) => id)).not.toContain(seeded.id);
      expect(products.filter(({ stock }) => stock !== MAINTENANCE.templateStock)).toEqual([]);
    },
  );

  test.fixme(
    'should return the documented counts when the account is reset',
    {
      tag: [TAGS.regression],
      // Labelled with this file's feature, like every other test in it.
      annotation: productDefect(
        'Maintenance',
        'POST /api/reset returns { message, products[] }, not the documented { message, groceries, basket, orders } counts',
      ),
    },
    async ({ maintenanceApi }) => {
      await labels({
        story: 'Documented responses',
        severity: Severity.MINOR,
      });

      const result = await maintenanceApi.reset();

      expect(result).toMatchObject({
        message: 'Reset complete',
        groceries: expect.any(Number),
        basket: 0,
        orders: 0,
      });
    },
  );
});
