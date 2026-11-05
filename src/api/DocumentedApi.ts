import { ApiClient } from '@api/ApiClient';
import { type ApiMessage, type BasketLine, type Product } from '@api/types';
import { DOCUMENTED_ENDPOINTS } from '@config/constants';

/**
 * Calls the paths exactly as Swagger (`/market/docs`) documents them, so contract tests can compare
 * the documentation with what the UI-facing endpoints do. Not for functional tests.
 */
export class DocumentedApi extends ApiClient {
  async listGroceries(): Promise<Product[]> {
    const body = await this.get<{ products: Product[] }>(DOCUMENTED_ENDPOINTS.groceries);
    return body.products;
  }

  async addBasketItem(productId: string, quantity: number): Promise<BasketLine> {
    const body = await this.post<{ data: BasketLine }>(DOCUMENTED_ENDPOINTS.basketItems, {
      product_id: productId,
      quantity,
    });
    return body.data;
  }

  /** `PUT /api/basket/items/{id}`, where the id is the basket item's own id. */
  updateBasketItem(itemId: string, quantity: number): Promise<unknown> {
    return this.put(`${DOCUMENTED_ENDPOINTS.basketItems}/${itemId}`, { quantity });
  }

  /** `DELETE /api/basket/items/{id}`, where the id is the basket item's own id. */
  removeBasketItem(itemId: string): Promise<ApiMessage> {
    return this.delete(`${DOCUMENTED_ENDPOINTS.basketItems}/${itemId}`);
  }

  clearBasket(): Promise<ApiMessage> {
    return this.delete(DOCUMENTED_ENDPOINTS.basket);
  }
}
