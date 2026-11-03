// Shapes observed on the live /api/* endpoints (Swagger has no response schemas). JSON boundary types only.
import {
  type ORDER_STATUSES,
  type PRODUCT_CATEGORIES,
  type SORT_ORDERS,
  type TEMPERATURE_ZONES,
} from '@config/constants';

export type SortOrder = (typeof SORT_ORDERS)[number];
export type TemperatureZone = (typeof TEMPERATURE_ZONES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** Categories offered by the UI. The API accepts any string, so inputs stay `string`. */
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductDetails = Record<string, unknown>;

/** `{ error }` body returned by every 4xx. */
export interface ApiErrorBody {
  error: string;
}

export interface ApiMessage {
  message: string;
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  api_key: string;
  created_at: string;
}

export interface LoginResponse extends ApiMessage {
  user: Record<string, unknown>;
}

/** Body of `POST/PUT /api/products`. */
export interface ProductInput {
  product_name: string;
  category: string;
  price: number;
  stock: number;
  details?: ProductDetails;
  temperature_zone?: TemperatureZone | null;
  weighted?: boolean;
}

export interface Product {
  id: string;
  owner_id: string;
  product_name: string;
  category: string;
  price: number;
  stock: number;
  details: ProductDetails | null;
  temperature_zone: TemperatureZone | null;
  weighted: boolean;
  created_at: string;
}

/**
 * Row returned by `GET /api/products/filter`: a bare array whose rows use `name`, not `product_name`.
 * Kept raw on purpose so the inconsistency stays visible to M3 tests.
 */
export type FilteredProduct = Omit<Product, 'product_name'> & { name: string };

export interface ProductFilter {
  category?: string;
  temperature_zone?: TemperatureZone;
  weighted?: boolean;
}

/** Basket row as stored, returned in `data` by `POST/PUT /api/basket`. */
export interface BasketLine {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

/** Basket row joined with its product, returned by `GET /api/basket`. */
export interface BasketItem {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  price: number;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface OrderItem {
  /** Present on `GET /api/orders/:id`, absent on list and place responses. */
  product_id?: string;
  product_name: string;
  category: string;
  price: number;
  quantity: number;
  temperature_zone: TemperatureZone | null;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  /** Absent on the `POST /api/orders` response. */
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  items: OrderItem[];
}

/** Order row returned by `PUT /api/orders/:id` (no items). */
export type OrderRecord = Omit<Order, 'items'> & { user_id: string };

export interface OrderUpdate {
  status?: OrderStatus;
  notes?: string;
}

export interface ResetResult extends ApiMessage {
  groceries: number;
  basket: number;
  orders: number;
}
