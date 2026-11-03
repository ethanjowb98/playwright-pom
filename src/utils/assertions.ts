// Shared assertions for specs. Page objects and API clients never import this.
import { expect } from '@playwright/test';

import { type Order, type Product, type ProductInput } from '@api/types';
import { type BasketSeed } from '@data/DataSeeder';

const MONEY_DIGITS = 2;

/** Checks a product has the full server shape and, when given, the values it was created with. */
export function expectProductShape(product: Product, input?: Partial<ProductInput>): void {
  expect(product).toMatchObject({
    id: expect.any(String),
    owner_id: expect.any(String),
    created_at: expect.any(String),
    product_name: expect.any(String),
    category: expect.any(String),
    price: expect.any(Number),
    stock: expect.any(Number),
    weighted: expect.any(Boolean),
  });
  if (input) expect(product).toMatchObject(input);
}

/**
 * Consistency: order total = Σ price × quantity of its items, and, when the basket lines it was
 * placed from are given, one item per line with the same name, price and quantity.
 */
export function expectOrderTotals(order: Order, lines?: BasketSeed[]): void {
  const itemsTotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  expect(order.total_amount, 'order total = Σ price × qty').toBeCloseTo(itemsTotal, MONEY_DIGITS);

  if (lines) {
    const expected = lines.map(({ product, quantity }) => ({
      product_name: product.product_name,
      price: product.price,
      quantity,
    }));
    expect(order.items).toHaveLength(lines.length);
    expect(order.items).toEqual(
      expect.arrayContaining(expected.map((item) => expect.objectContaining(item))),
    );
  }
}
