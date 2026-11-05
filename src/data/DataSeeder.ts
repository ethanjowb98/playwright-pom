import { faker } from '@faker-js/faker';

import { ApiError } from '@api/ApiClient';
import { type BasketApi } from '@api/BasketApi';
import { type OrdersApi } from '@api/OrdersApi';
import { type ProductsApi } from '@api/ProductsApi';
import {
  type BasketLine,
  type Order,
  type OrderStatus,
  type Product,
  type ProductInput,
} from '@api/types';
import { TEST_DATA } from '@config/constants';
import { buildProduct } from '@data/factories/productFactory';
import { SORT_SEED_SUFFIXES } from '@data/sortCases';
import { step } from '@utils/allure';

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
 * to `trackProduct` / `trackOrder` / `trackBasketItem` so it is cleaned up too. A product the UI is
 * about to create is registered by name with `expectProductNamed` *before* the action, so it is
 * cleaned up even when the test fails before it could look the product up.
 *
 * Basket and order seeding use the account-wide basket: only call them from `@stateful` tests.
 */
export class DataSeeder {
  private readonly productIds = new Set<string>();
  private readonly basketProductIds = new Set<string>();
  private readonly orderIds = new Set<string>();
  private readonly expectedProductNames = new Set<string>();
  private readonly expectedOrderProducts = new Set<string>();

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

  /**
   * Registers the unique name of a product the UI may create. Call it before the action: teardown deletes
   * any product with that name, and finds nothing to delete if none was created.
   */
  expectProductNamed(name: string): void {
    this.expectedProductNames.add(name);
  }

  /**
   * Fallback for an order the UI is about to place: teardown deletes any order containing one of these
   * (unique) product names. Covers an order created server-side whose response the test never saw.
   */
  expectOrderWith(productNames: readonly string[]): void {
    for (const name of productNames) this.expectedOrderProducts.add(name);
  }

  /** Tracks a product the UI created, found by its unique name. Throws if the API has no such product. */
  @step((name: string) => `Track product "${name}"`)
  async trackProductNamed(name: string): Promise<Product> {
    const product = (await this.products.list()).find((p) => p.product_name === name);
    if (!product) throw new Error(`The API has no product named "${name}"`);
    return this.trackProduct(product);
  }

  @step('Seed product')
  async seedProduct(overrides: Partial<ProductInput> = {}): Promise<Product> {
    return this.trackProduct(await this.products.create(buildProduct(overrides)));
  }

  /**
   * Seeds one product per `SORT_SEED_SUFFIXES`, named `<token> <suffix>`. Pass a `uniqueName` token, so
   * other workers' data cannot interleave; filter or search by it afterwards.
   */
  @step((token: string) => `Seed products to sort under "${token}"`)
  async seedSortSet(token: string): Promise<string> {
    await Promise.all(
      SORT_SEED_SUFFIXES.map((suffix) => this.seedProduct({ product_name: `${token} ${suffix}` })),
    );
    return token;
  }

  seedProducts(count: number, overrides: Partial<ProductInput> = {}): Promise<Product[]> {
    return Promise.all(Array.from({ length: count }, () => this.seedProduct(overrides)));
  }

  /** Seeds one fresh product and adds it to the basket. */
  async seedBasketLine(quantity?: number): Promise<BasketSeed> {
    const [line] = await this.seedBasket({ items: 1, quantity });
    if (!line) throw new Error('seedBasket returned no line');
    return line;
  }

  /** Seeds fresh products and adds each to the basket. */
  @step(({ items = 1 }: BasketSeedOptions = {}) => `Seed basket with ${items} item(s)`)
  async seedBasket({ items = 1, quantity }: BasketSeedOptions = {}): Promise<BasketSeed[]> {
    const products = await this.seedProducts(items);
    const lines: BasketSeed[] = [];
    // Sequential: concurrent writes to one basket are what the basket isolation tests exercise, not seeding.
    for (const product of products) {
      const line = { product, quantity: quantity ?? faker.number.int(TEST_DATA.basketQuantity) };
      await this.addToBasket(product.id, line.quantity);
      lines.push(line);
    }
    return lines;
  }

  /** Adds an existing product to the basket and tracks it for cleanup (tracked before the call, so a partial failure is still cleaned). */
  async addToBasket(productId: string, quantity: number): Promise<BasketLine> {
    this.trackBasketItem(productId);
    return await this.basket.add(productId, quantity);
  }

  /**
   * Seeds a basket and places an order from it, then moves it to `status` if given (re-read from the API).
   * Fails fast if the basket holds anything else, because the order would silently absorb those foreign items.
   */
  @step('Seed order')
  async seedOrder({
    notes,
    status,
    ...basket
  }: BasketSeedOptions & { notes?: string; status?: OrderStatus } = {}): Promise<SeededOrder> {
    const lines = await this.seedBasket(basket);
    await this.assertBasketHoldsOnly(lines);
    const placed = this.trackOrder(await this.orders.place(notes));
    for (const { product } of lines) this.basketProductIds.delete(product.id);
    if (status && status !== placed.status) {
      await this.orders.update(placed.id, { status });
      return { order: await this.orders.getById(placed.id), lines };
    }
    return { order: placed, lines };
  }

  /** Deletes everything tracked. Idempotent; a 404 counts as already gone. Throws if anything is left behind. */
  @step('Clean up seeded data')
  async cleanup(): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.resolveExpectedOrders();
    } catch (error) {
      failures.push(error);
    }
    failures.push(
      ...(await this.removeAll(this.orderIds, (id) => this.orders.remove(id))),
      ...(await this.removeAll(this.basketProductIds, (id) => this.basket.remove(id))),
    );
    try {
      await this.resolveExpectedProducts();
    } catch (error) {
      failures.push(error);
    }
    failures.push(...(await this.removeAll(this.productIds, (id) => this.products.remove(id))));
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `DataSeeder cleanup left ${failures.length} record(s) behind`,
      );
    }
  }

  /** Adds the orders holding an expected product to the tracked ids. */
  private async resolveExpectedOrders(): Promise<void> {
    if (this.expectedOrderProducts.size === 0) return;
    const names = new Set(this.expectedOrderProducts);
    this.expectedOrderProducts.clear();
    for (const order of await this.orders.list()) {
      if (order.items.some((item) => names.has(item.product_name))) this.orderIds.add(order.id);
    }
  }

  /** Adds the products the UI created under an expected name to the tracked ids. */
  private async resolveExpectedProducts(): Promise<void> {
    if (this.expectedProductNames.size === 0) return;
    const names = new Set(this.expectedProductNames);
    this.expectedProductNames.clear();
    for (const product of await this.products.list()) {
      if (names.has(product.product_name)) this.productIds.add(product.id);
    }
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
