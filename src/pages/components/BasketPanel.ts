import { type Locator, type Page } from '@playwright/test';

import { type Order } from '@api/types';
import { ENDPOINTS } from '@config/constants';
import { answerDialog } from '@pages/dialogs';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/** Basket tab (`#basket-tab`): line items, quantity controls and the order summary. */
export class BasketPanel {
  readonly root: Locator;
  readonly items: Locator;
  readonly emptyState: Locator;
  readonly total: Locator;
  readonly clearAllButton: Locator;
  readonly placeOrderButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#basket-tab');
    this.items = this.root.locator('.basket-item');
    this.emptyState = this.root.locator('.empty-state');
    this.total = this.root.locator('.basket-checkout-total');
    this.clearAllButton = this.root.getByRole('button', { name: 'Clear All' });
    this.placeOrderButton = this.root.getByRole('button', { name: 'Place Order' });
  }

  item(name: string): Locator {
    return this.items.filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }

  quantity(name: string): Locator {
    return this.item(name).locator('.quantity-control span');
  }

  increaseButton(name: string): Locator {
    return this.item(name).getByRole('button', { name: '+', exact: true });
  }

  decreaseButton(name: string): Locator {
    return this.item(name).getByRole('button', { name: '-', exact: true });
  }

  @step((name: string) => `Increase "${name}" in the basket`)
  async increase(name: string): Promise<this> {
    await whileAwaitingApi(this.page, 'PUT', ENDPOINTS.basket, () =>
      this.increaseButton(name).click(),
    );
    return this;
  }

  /** At quantity 1 the app removes the item instead (DELETE). */
  @step((name: string) => `Decrease "${name}" in the basket`)
  async decrease(name: string): Promise<this> {
    await whileAwaitingApi(this.page, ['PUT', 'DELETE'], ENDPOINTS.basket, () =>
      this.decreaseButton(name).click(),
    );
    return this;
  }

  @step((name: string) => `Remove "${name}" from the basket`)
  async remove(name: string): Promise<this> {
    await whileAwaitingApi(this.page, 'DELETE', ENDPOINTS.basket, () =>
      this.item(name).getByRole('button', { name: 'Remove', exact: true }).click(),
    );
    return this;
  }

  /** Clicks Clear All, accepts the `confirm()` and waits for the clear. Returns the dialog message. */
  @step('Clear the basket')
  async clearAll(): Promise<string> {
    return answerDialog(this.page, () =>
      whileAwaitingApi(this.page, 'DELETE', ENDPOINTS.basketClear, () =>
        this.clearAllButton.click(),
      ),
    );
  }

  /** Clicks Clear All, then dismisses the `confirm()`. No request is sent. Returns the dialog message. */
  @step('Start clearing the basket, then dismiss')
  async abandonClearAll(): Promise<string> {
    return answerDialog(this.page, () => this.clearAllButton.click(), 'dismiss');
  }

  /**
   * Places the order and returns it as the API created it, so the test can track it for cleanup before
   * any UI check. The success modal opens on `MarketPage.orderSuccess`.
   */
  @step('Place the order')
  async placeOrder(): Promise<Order> {
    const response = await whileAwaitingApi(this.page, 'POST', ENDPOINTS.orders, () =>
      this.placeOrderButton.click(),
    );
    const { order } = (await response.json()) as { order?: Order };
    if (!order?.id) throw new Error(`POST ${ENDPOINTS.orders} returned no order: cannot track it`);
    return order;
  }
}
