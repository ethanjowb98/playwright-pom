import { ApiClient } from '@api/ApiClient';
import { type ApiMessage, type BasketItem, type BasketLine } from '@api/types';
import { ENDPOINTS } from '@config/constants';

/**
 * Typed client for `/api/basket`. Items are keyed by product id.
 * The basket is account-wide, so specs using it must be tagged `@stateful` (single-worker project).
 */
export class BasketApi extends ApiClient {
  async list(): Promise<BasketItem[]> {
    const body = await this.get<{ items: BasketItem[] }>(ENDPOINTS.basket);
    return body.items;
  }

  /** Adds a product, or increments its quantity when it is already in the basket. */
  async add(productId: string, quantity: number): Promise<BasketLine> {
    const body = await this.post<{ data: BasketLine }>(ENDPOINTS.basket, {
      product_id: productId,
      quantity,
    });
    return body.data;
  }

  /** Sends an untyped body, for invalid-payload (400) tests. */
  async addRaw(payload: Record<string, unknown>): Promise<BasketLine> {
    const body = await this.post<{ data: BasketLine }>(ENDPOINTS.basket, payload);
    return body.data;
  }

  /** Sets the absolute quantity of a product already in the basket. */
  async setQuantity(productId: string, quantity: number): Promise<BasketLine> {
    const body = await this.put<{ data: BasketLine }>(ENDPOINTS.basket, {
      product_id: productId,
      quantity,
    });
    return body.data;
  }

  remove(productId: string): Promise<ApiMessage> {
    return this.delete(`${ENDPOINTS.basket}/${productId}`);
  }

  clear(): Promise<ApiMessage> {
    return this.delete(ENDPOINTS.basketClear);
  }
}
