import { TAGS } from '@config/constants';
import { buildProduct } from '@data/factories/productFactory';
import { uniqueName } from '@data/uniqueName';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';
import { money, roundMoney } from '@utils/format';

test.describe('Products UI', { tag: [TAGS.e2e] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Products' });
  });

  test(
    'should create the product when the Add Product form is valid',
    { tag: [TAGS.smoke] },
    async ({ seeder, productsApi, marketPage }) => {
      await labels({ story: 'Create', severity: Severity.BLOCKER });
      const { product_name, category, price, stock, details } = buildProduct();
      seeder.expectProductNamed(product_name);
      await marketPage.open();

      const modal = await marketPage.openAddProduct();
      await modal.fill({ product_name, category, price, stock, details });
      await modal.save();

      // Assert: the UI shows it and the API stored exactly what was typed
      const created = await seeder.trackProductNamed(product_name);
      await expect(marketPage.products.card(product_name)).toBeVisible();
      await expect(marketPage.products.price(product_name)).toHaveText(money(price));
      expect(await productsApi.getById(created.id)).toMatchObject({
        product_name,
        category,
        price,
        stock,
        details,
      });
    },
  );

  test(
    'should keep the modal open and create nothing when the category is missing',
    { tag: [TAGS.regression] },
    async ({ seeder, productsApi, marketPage }) => {
      await labels({ story: 'Create validation', severity: Severity.NORMAL });
      const { product_name, price, stock } = buildProduct();
      // Cleans up if the defect this guards against happens and a product is created anyway
      seeder.expectProductNamed(product_name);
      await marketPage.open();

      const modal = await marketPage.openAddProduct();
      await modal.fill({ product_name, price, stock });
      await modal.trySave();

      // The browser's validation blocked the submit, so no request can still be in flight
      expect(await modal.validationMessage(modal.category)).not.toBe('');
      await expect(modal.root).toBeVisible();
      expect((await productsApi.list()).map((p) => p.product_name)).not.toContain(product_name);
    },
  );

  test(
    'should save the new price and stock when the product is edited',
    { tag: [TAGS.smoke] },
    async ({ seeder, productsApi, marketPage }) => {
      await labels({ story: 'Update', severity: Severity.CRITICAL });
      const product = await seeder.seedProduct();
      const changes = { price: roundMoney(product.price + 1), stock: product.stock + 1 };
      await marketPage.open();

      await marketPage.products.edit(product.product_name);
      await expect(marketPage.productModal.name).toHaveValue(product.product_name);
      await marketPage.productModal.fill(changes);
      await marketPage.productModal.save();

      await expect(marketPage.products.price(product.product_name)).toHaveText(
        money(changes.price),
      );
      expect(await productsApi.getById(product.id)).toMatchObject(changes);
    },
  );

  test(
    'should remove the product when the delete is confirmed',
    { tag: [TAGS.smoke] },
    async ({ seeder, productsApi, marketPage }) => {
      await labels({ story: 'Delete', severity: Severity.CRITICAL });
      const product = await seeder.seedProduct();
      await marketPage.open();

      const message = await marketPage.products.delete(product.product_name);

      expect(message).toContain('delete this product');
      await expect(marketPage.products.card(product.product_name)).toHaveCount(0);
      await expect(productsApi.getById(product.id)).rejects.toMatchObject({ status: 404 });
    },
  );

  test(
    'should keep the product when the delete is dismissed',
    { tag: [TAGS.regression] },
    async ({ seeder, productsApi, marketPage }) => {
      await labels({ story: 'Delete', severity: Severity.NORMAL });
      const product = await seeder.seedProduct();
      await marketPage.open();

      await marketPage.products.delete(product.product_name, 'dismiss');

      await marketPage.reload();
      await expect(marketPage.products.card(product.product_name)).toBeVisible();
      expect(await productsApi.getById(product.id)).toEqual(product);
    },
  );

  test(
    'should show every field of the product when its details are viewed',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Read', severity: Severity.NORMAL });
      const product = await seeder.seedProduct({ details: { origin: 'Spain', brand: 'Acme' } });
      await marketPage.open();

      await marketPage.products.viewDetails(product.product_name);

      const { itemDetails } = marketPage;
      await expect(itemDetails.title).toContainText(product.product_name);
      await expect(itemDetails.content).toContainText(money(product.price));
      await expect(itemDetails.content).toContainText(`${product.stock} units`);
      await expect(itemDetails.content).toContainText('Spain');
      await expect(itemDetails.content).toContainText('Acme');
      await expect(itemDetails.content).toContainText(product.id);
    },
  );

  test(
    'should show a disabled Out of Stock button and no ADD when the stock is zero',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Stock', severity: Severity.NORMAL });
      const product = await seeder.seedProduct({ stock: 0 });
      await marketPage.open();

      await expect(marketPage.products.outOfStockButton(product.product_name)).toBeDisabled();
      await expect(marketPage.products.addButton(product.product_name)).toHaveCount(0);
    },
  );

  // PRODUCT DEFECT: the grid injects product names into innerHTML unescaped (stored XSS); see ROADMAP notes.
  test.fixme(
    'should render the product name as plain text when it contains markup',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Read', severity: Severity.CRITICAL });
      const product = await seeder.seedProduct({ product_name: uniqueName('<i>markup</i>') });
      await marketPage.open();

      // The heading's accessible name keeps the tags only if they were not parsed as HTML.
      await expect(marketPage.products.card(product.product_name)).toBeVisible();
    },
  );
});
