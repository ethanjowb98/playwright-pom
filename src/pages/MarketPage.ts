import { expect, type Locator, type Page } from '@playwright/test';

import { ENDPOINTS, ROUTES } from '@config/constants';
import { BasePage } from '@pages/BasePage';
import { BasketPanel } from '@pages/components/BasketPanel';
import { FilterSidebar } from '@pages/components/FilterSidebar';
import { ItemDetailsModal } from '@pages/components/ItemDetailsModal';
import { OrdersPanel } from '@pages/components/OrdersPanel';
import { OrderSuccessModal } from '@pages/components/OrderSuccessModal';
import { ProductGrid } from '@pages/components/ProductGrid';
import { ProductModal } from '@pages/components/ProductModal';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/**
 * Market app (`/market.html`). The page loads products, basket and orders in parallel and renders
 * everything client-side; it never refreshes on its own, so data seeded after `open()` needs `reload()`.
 */
export class MarketPage extends BasePage {
  readonly username: Locator;
  /** Header badge: number of basket lines (not units). */
  readonly basketBadge: Locator;
  /** Header stat: total basket units. */
  readonly basketUnits: Locator;
  /** Toast for success / error messages. */
  readonly alert: Locator;
  readonly productsTab: Locator;
  readonly basketTab: Locator;
  readonly ordersTab: Locator;
  readonly addProductButton: Locator;

  readonly products: ProductGrid;
  readonly filters: FilterSidebar;
  readonly productModal: ProductModal;
  readonly itemDetails: ItemDetailsModal;
  readonly basket: BasketPanel;
  readonly orderSuccess: OrderSuccessModal;
  readonly orders: OrdersPanel;

  constructor(page: Page) {
    super(page, ROUTES.market);
    this.username = page.locator('#headerUsername');
    this.basketBadge = page.locator('#basketCount');
    this.basketUnits = page.locator('#basketItemsStat');
    this.alert = page.locator('#alert');
    const tabs = page.locator('.tabs');
    this.productsTab = tabs.getByRole('button', { name: 'Products' });
    this.basketTab = tabs.getByRole('button', { name: 'Basket' });
    this.ordersTab = tabs.getByRole('button', { name: 'Orders' });
    this.addProductButton = page.getByRole('button', { name: '+ Add Product', exact: true });

    this.products = new ProductGrid(page);
    this.filters = new FilterSidebar(page);
    this.productModal = new ProductModal(page);
    this.itemDetails = new ItemDetailsModal(page);
    this.basket = new BasketPanel(page);
    this.orderSuccess = new OrderSuccessModal(page);
    this.orders = new OrdersPanel(page);
  }

  @step('Open the Add Product modal')
  async openAddProduct(): Promise<ProductModal> {
    await this.addProductButton.click();
    await this.productModal.root.waitFor();
    return this.productModal;
  }

  /** Each tab refetches its data when opened. */
  @step('Open the Products tab')
  async openProducts(): Promise<ProductGrid> {
    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.products, () => this.productsTab.click());
    return this.products;
  }

  @step('Open the Basket tab')
  async openBasket(): Promise<BasketPanel> {
    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.basket, () => this.basketTab.click());
    return this.basket;
  }

  @step('Open the Orders tab')
  async openOrders(): Promise<OrdersPanel> {
    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.orders, () => this.ordersTab.click());
    return this.orders;
  }

  /**
   * Ready when the profile has loaded and all three lists have rendered (each container gets at least
   * an empty state). The basket renders last-wins over the grid, so the grid already reflects the basket.
   */
  protected async waitUntilReady(): Promise<void> {
    await expect(this.username).not.toBeEmpty();
    await Promise.all(
      [
        this.products.root,
        this.basket.root.locator('#basketContent'),
        this.orders.root.locator('#ordersContent'),
      ].map((container) => container.locator(':scope > *').first().waitFor({ state: 'attached' })),
    );
  }
}
