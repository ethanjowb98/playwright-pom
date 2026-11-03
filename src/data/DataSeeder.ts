import { faker } from '@faker-js/faker';
import { step } from 'allure-js-commons';

import { ApiError } from '@api/ApiClient';
import { type BasketApi } from '@api/BasketApi';
import { type OrdersApi } from '@api/OrdersApi';
import { type ProductsApi } from '@api/ProductsApi';
import { type Order, type Product, type ProductInput } from '@api/types';
import { TEST_DATA } from '@config/constants';
import { buildProduct } from '@data/factories/productFactory';

export interface BasketSeed {
  product: Product;
  quantity: number;
}

export interface BasketSeedOptions {
  /** Number of fresh products to put in the basket. Default 1. */
  items?: number;
  /** Quantity per product. Default: random within `TEST_DATA.basketQuantity` (always ≤ seeded stock). */
  quantity?: number;
}

export interface SeededOrder {
  order: Order;
  lines: BasketSeed[];
}

/**
 * Creates test data through the API and deletes it in fixture teardown, in dependency order
 * (orders → basket items → products). Anything a test creates outside the seeder can be handed
 * to `trackProduct` / `trackOrder` / `trackBasketItem` so it is cleaned up too.
 *
 * Basket and order seeding use the account-wide basket: only call them from `@stateful` tests.
 */
export class DataSeeder {
  private readonly productIds = new Set<string>();
  private readonly basketProductIds = new Set<string>();
  private readonly orderIds = new Set<string>();

  constructor(
    private readonly products: ProductsApi,
    private readonly basket: BasketApi,
    private readonly orders: OrdersApi,
  ) {}

  trackProduct<T extends Pick<Product, 'id'>>(product: T): T {
    this.productIds.add(product.id);
    return product;
  }

  trackOrder<T extends Pick<Order, 'id'>>(order: T): T {
    this.orderIds.add(order.id);
    return order;
  }

  trackBasketItem(productId: string): void {
    this.basketProductIds.add(productId);
  }

  async seedProduct(overrides: Partial<ProductInput> = {}): Promise<Product> {
    return await step('Seed product', async () =>
      this.trackProduct(await this.products.create(buildProduct(overrides))),
    );
  }

  seedProducts(count: number, overrides: Partial<ProductInput> = {}): Promise<Product[]> {
    return Promise.all(Array.from({ length: count }, () => this.seedProduct(overrides)));
  }

  /** Seeds fresh products and adds each to the basket. */
  async seedBasket({ items = 1, quantity }: BasketSeedOptions = {}): Promise<BasketSeed[]> {
    return await step(`Seed basket with ${items} item(s)`, async () => {
      const products = await this.seedProducts(items);
      const lines: BasketSeed[] = [];
      // Sequential: concurrent writes to one basket are an M3 isolation scenario, not a seeding concern.
      for (const product of products) {
        const line = { product, quantity: quantity ?? faker.number.int(TEST_DATA.basketQuantity) };
        this.trackBasketItem(product.id);
        await this.basket.add(product.id, line.quantity);
        lines.push(line);
      }
      return lines;
    });
  }

  /**
   * Seeds a basket and places an order from it. Fails fast if the basket holds anything else,
   * because the order would silently absorb those foreign items.
   */
  async seedOrder({
    notes,
    ...basket
  }: BasketSeedOptions & { notes?: string } = {}): Promise<SeededOrder> {
    return await step('Seed order', async () => {
      const lines = await this.seedBasket(basket);
      await this.assertBasketHoldsOnly(lines);
      const order = this.trackOrder(await this.orders.place(notes));
      for (const { product } of lines) this.basketProductIds.delete(product.id);
      return { order, lines };
    });
  }

  /** Deletes everything tracked. Idempotent; a 404 counts as already gone. Throws if anything is left behind. */
  async cleanup(): Promise<void> {
    await step('Clean up seeded data', async () => {
      const failures = [
        ...(await this.removeAll(this.orderIds, (id) => this.orders.remove(id))),
        ...(await this.removeAll(this.basketProductIds, (id) => this.basket.remove(id))),
        ...(await this.removeAll(this.productIds, (id) => this.products.remove(id))),
      ];
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `DataSeeder cleanup left ${failures.length} record(s) behind`,
        );
      }
    });
  }

  private async assertBasketHoldsOnly(lines: BasketSeed[]): Promise<void> {
    const seeded = new Set(lines.map(({ product }) => product.id));
    const foreign = (await this.basket.list()).filter((item) => !seeded.has(item.product_id));
    if (foreign.length > 0) {
      const names = foreign.map((item) => item.product_name).join(', ');
      throw new Error(
        `Basket holds ${foreign.length} item(s) this test did not seed (${names}). ` +
          'Is a basket test running outside the @stateful project?',
      );
    }
  }

  private async removeAll(
    ids: Set<string>,
    remove: (id: string) => Promise<unknown>,
  ): Promise<unknown[]> {
    const results = await Promise.allSettled([...ids].map(remove));
    ids.clear();
    return results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown)
      .filter((reason) => !(reason instanceof ApiError && reason.status === 404));
  }
}
