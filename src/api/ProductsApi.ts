import { ApiClient } from '@api/ApiClient';
import {
  type ApiMessage,
  type FilteredProduct,
  type Product,
  type ProductFilter,
  type ProductInput,
  type SortOrder,
} from '@api/types';
import { ENDPOINTS } from '@config/constants';

/** Typed client for `/api/products` (the path the UI uses; Swagger documents `/api/groceries`). */
export class ProductsApi extends ApiClient {
  async list(sort?: SortOrder): Promise<Product[]> {
    const body = await this.get<{ products: Product[] }>(ENDPOINTS.products, { sort });
    return body.products;
  }

  /** Returns raw rows: the filter endpoint names the field `name`, not `product_name`. */
  filter(filter: ProductFilter): Promise<FilteredProduct[]> {
    return this.get<FilteredProduct[]>(ENDPOINTS.productsFilter, { ...filter });
  }

  getById(id: string): Promise<Product> {
    return this.get<Product>(`${ENDPOINTS.products}/${id}`);
  }

  create(input: ProductInput): Promise<Product> {
    return this.post<Product>(ENDPOINTS.products, input);
  }

  update(id: string, input: Partial<ProductInput>): Promise<Product> {
    return this.put<Product>(`${ENDPOINTS.products}/${id}`, input);
  }

  /** Sends an untyped body, for invalid-payload (400) tests. */
  createRaw(payload: Record<string, unknown>): Promise<Product> {
    return this.post<Product>(ENDPOINTS.products, payload);
  }

  /** Sends an untyped body, for invalid-payload (400) tests. */
  updateRaw(id: string, payload: Record<string, unknown>): Promise<Product> {
    return this.put<Product>(`${ENDPOINTS.products}/${id}`, payload);
  }

  remove(id: string): Promise<ApiMessage> {
    return this.delete(`${ENDPOINTS.products}/${id}`);
  }
}
