import { ApiClient } from '@api/ApiClient';
import { type ApiMessage, type Order, type OrderRecord, type OrderUpdate } from '@api/types';
import { ENDPOINTS } from '@config/constants';

/** Typed client for `/api/orders`. Placing an order consumes the whole account basket. */
export class OrdersApi extends ApiClient {
  async list(): Promise<Order[]> {
    const body = await this.get<{ orders: Order[] }>(ENDPOINTS.orders);
    return body.orders;
  }

  getById(id: string): Promise<Order> {
    return this.get<Order>(`${ENDPOINTS.orders}/${id}`);
  }

  async place(notes?: string): Promise<Order> {
    const body = await this.post<{ order: Order }>(
      ENDPOINTS.orders,
      notes === undefined ? undefined : { notes },
    );
    return body.order;
  }

  async update(id: string, update: OrderUpdate): Promise<OrderRecord> {
    const body = await this.put<{ order: OrderRecord }>(`${ENDPOINTS.orders}/${id}`, update);
    return body.order;
  }

  /** Sends an untyped body, for invalid-payload (400) tests. */
  async updateRaw(id: string, payload: Record<string, unknown>): Promise<OrderRecord> {
    const body = await this.put<{ order: OrderRecord }>(`${ENDPOINTS.orders}/${id}`, payload);
    return body.order;
  }

  remove(id: string): Promise<ApiMessage> {
    return this.delete(`${ENDPOINTS.orders}/${id}`);
  }
}
