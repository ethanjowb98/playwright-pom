import { ApiClient } from '@api/ApiClient';
import { type BasketLine, type Product } from '@api/types';
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
}
