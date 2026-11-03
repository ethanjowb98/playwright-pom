import { type Locator, type Page } from '@playwright/test';

import { ENDPOINTS } from '@config/constants';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/** "Order Placed Successfully!" modal shown after checkout. */
export class OrderSuccessModal {
  readonly root: Locator;
  readonly orderNumber: Locator;
  readonly total: Locator;
  /** One row per item: `<name> × <qty>` and its subtotal. */
  readonly items: Locator;
  readonly viewOrdersButton: Locator;
  readonly continueShoppingButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#orderSuccessModal');
    this.orderNumber = page.locator('#orderNumber');
    this.total = page.locator('#orderTotal');
    this.items = page.locator('#orderItemsList > div');
    this.viewOrdersButton = this.root.getByRole('button', { name: 'View Orders', exact: true });
    this.continueShoppingButton = this.root.getByRole('button', {
      name: 'Continue Shopping',
      exact: true,
    });
  }

  /** Closes the modal and switches to the Orders tab once the list has reloaded. */
  @step('View orders from the success modal')
  async viewOrders(): Promise<this> {
    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.orders, () => this.viewOrdersButton.click());
    return this;
  }
}
