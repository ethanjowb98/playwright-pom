import { TAGS } from '@config/constants';
import { expect, test } from '@fixtures';
import { type BasketPanel } from '@pages/components/BasketPanel';
import { labels, Severity } from '@utils/allure';
import { money } from '@utils/format';

const quantityChanges: {
  control: string;
  from: number;
  to: number;
  act: (basket: BasketPanel, name: string) => Promise<unknown>;
}[] = [
  { control: '+', from: 2, to: 3, act: (basket, name) => basket.increase(name) },
  { control: '-', from: 2, to: 1, act: (basket, name) => basket.decrease(name) },
];

// The basket is account-wide, so this whole file runs in the single-worker stateful project.
test.describe('Basket UI', { tag: [TAGS.e2e, TAGS.stateful] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Basket' });
  });

  test.describe('Product cards', () => {
    test(
      'should put one unit in the basket when ADD is clicked',
      { tag: [TAGS.smoke] },
      async ({ seeder, basketApi, marketPage }) => {
        await labels({ story: 'Add', severity: Severity.BLOCKER });
        const product = await seeder.seedProduct();
        seeder.trackBasketItem(product.id);
        await marketPage.open();

        await marketPage.products.addToBasket(product.product_name);

        await expect(marketPage.products.quantity(product.product_name)).toHaveText('1');
        await expect(marketPage.basketBadge).toHaveText('1');
        expect(await basketApi.list()).toEqual([
          expect.objectContaining({ product_id: product.id, quantity: 1 }),
        ]);
      },
    );

    test(
      'should add one unit when + is clicked on the card',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi, marketPage }) => {
        await labels({ story: 'Update', severity: Severity.CRITICAL });
        const { product } = await seeder.seedBasketLine(1);
        await marketPage.open();

        await marketPage.products.increase(product.product_name);

        await expect(marketPage.products.quantity(product.product_name)).toHaveText('2');
        expect(await basketApi.list()).toEqual([expect.objectContaining({ quantity: 2 })]);
      },
    );

    test(
      'should remove the item and show ADD again when - is clicked at quantity 1',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi, marketPage }) => {
        await labels({ story: 'Delete', severity: Severity.CRITICAL });
        const { product } = await seeder.seedBasketLine(1);
        await marketPage.open();

        await marketPage.products.decrease(product.product_name);

        await expect(marketPage.products.addButton(product.product_name)).toBeVisible();
        await expect(marketPage.basketBadge).toHaveText('0');
        expect(await basketApi.list()).toEqual([]);
      },
    );

    test(
      'should disable + when the basket holds the whole stock',
      { tag: [TAGS.regression] },
      async ({ seeder, marketPage }) => {
        await labels({ story: 'Stock limit', severity: Severity.CRITICAL });
        const product = await seeder.seedProduct({ stock: 2 });
        await seeder.addToBasket(product.id, 2);
        await marketPage.open();

        await expect(marketPage.products.increaseButton(product.product_name)).toBeDisabled();
        await marketPage.openBasket();
        await expect(marketPage.basket.increaseButton(product.product_name)).toBeDisabled();
      },
    );
  });

  test.describe('Basket tab', () => {
    test(
      'should list every item with its subtotal and the basket total when the Basket tab is opened',
      { tag: [TAGS.smoke] },
      async ({ seeder, marketPage }) => {
        await labels({ story: 'Read', severity: Severity.CRITICAL });
        const lines = await seeder.seedBasket({ items: 2 });
        const total = lines.reduce(
          (sum, { product, quantity }) => sum + product.price * quantity,
          0,
        );
        await marketPage.open();

        const basket = await marketPage.openBasket();

        await expect(basket.items).toHaveCount(lines.length);
        for (const { product, quantity } of lines) {
          await expect(basket.quantity(product.product_name)).toHaveText(String(quantity));
          await expect(basket.item(product.product_name)).toContainText(
            `Subtotal: ${money(product.price * quantity)}`,
          );
        }
        await expect(basket.total).toContainText(money(total));
      },
    );

    for (const { control, from, to, act } of quantityChanges) {
      test(
        `should change the quantity from ${from} to ${to} when ${control} is clicked`,
        { tag: [TAGS.regression] },
        async ({ seeder, basketApi, marketPage }) => {
          await labels({ story: 'Update', severity: Severity.CRITICAL });
          const { product } = await seeder.seedBasketLine(from);
          await marketPage.open();
          const basket = await marketPage.openBasket();

          await act(basket, product.product_name);

          await expect(basket.quantity(product.product_name)).toHaveText(String(to));
          expect(await basketApi.list()).toEqual([expect.objectContaining({ quantity: to })]);
        },
      );
    }

    test(
      'should remove only that item when Remove is clicked',
      { tag: [TAGS.smoke] },
      async ({ seeder, basketApi, marketPage }) => {
        await labels({ story: 'Delete', severity: Severity.CRITICAL });
        const removed = await seeder.seedBasketLine();
        const kept = await seeder.seedBasketLine();
        await marketPage.open();
        const basket = await marketPage.openBasket();

        await basket.remove(removed.product.product_name);

        await expect(basket.item(removed.product.product_name)).toHaveCount(0);
        await expect(basket.item(kept.product.product_name)).toBeVisible();
        await expect(marketPage.basketBadge).toHaveText('1');
        expect((await basketApi.list()).map((item) => item.product_id)).toEqual([kept.product.id]);
      },
    );

    test(
      'should empty the basket when Clear All is confirmed',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi, marketPage }) => {
        await labels({ story: 'Clear', severity: Severity.CRITICAL });
        await seeder.seedBasket({ items: 2 });
        await marketPage.open();
        const basket = await marketPage.openBasket();

        const message = await basket.clearAll();

        expect(message).toContain('clear your entire basket');
        await expect(basket.emptyState).toBeVisible();
        await expect(marketPage.basketBadge).toHaveText('0');
        expect(await basketApi.list()).toEqual([]);
      },
    );

    test(
      'should keep every item when Clear All is dismissed',
      { tag: [TAGS.regression] },
      async ({ seeder, basketApi, marketPage }) => {
        await labels({ story: 'Clear', severity: Severity.NORMAL });
        const lines = await seeder.seedBasket({ items: 2 });
        await marketPage.open();
        await marketPage.openBasket();

        await marketPage.basket.abandonClearAll();

        // Durability: re-read after the page reloads, not the state the dismissed dialog left on screen
        await marketPage.reload();
        const basket = await marketPage.openBasket();
        await expect(basket.items).toHaveCount(lines.length);
        expect((await basketApi.list()).map((item) => item.product_id).sort()).toEqual(
          lines.map(({ product }) => product.id).sort(),
        );
      },
    );
  });

  test(
    'should show the API basket line count on the badge and its units in the stats when the basket holds several lines',
    { tag: [TAGS.regression] },
    async ({ seeder, basketApi, marketPage }) => {
      await labels({ story: 'Consistency', severity: Severity.NORMAL });
      await seeder.seedBasket({ items: 2, quantity: 2 });
      const items = await basketApi.list();
      const units = items.reduce((sum, item) => sum + item.quantity, 0);

      await marketPage.open();

      await expect(marketPage.basketBadge).toHaveText(String(items.length));
      await expect(marketPage.basketUnits).toHaveText(String(units));
    },
  );
});
