import { expect, type Locator, type Page } from '@playwright/test';

import { type OrderStatus } from '@api/types';
import { ENDPOINTS, TERMINAL_ORDER_STATUSES, TIMEOUTS } from '@config/constants';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/**
 * Orders tab (`#orders-tab`). Cards render collapsed; the status select and delete button live in the
 * expanded details. Terminal statuses (delivered / cancelled) and deletes go through confirm modals.
 */
export class OrdersPanel {
  readonly root: Locator;
  readonly cards: Locator;
  readonly emptyState: Locator;
  readonly statusModal: Locator;
  readonly confirmStatusButton: Locator;
  readonly deleteModal: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#orders-tab');
    this.cards = this.root.locator('.order-card');
    this.emptyState = this.root.locator('.empty-state');
    this.statusModal = page.locator('#statusChangeModal');
    this.confirmStatusButton = this.statusModal.getByRole('button', {
      name: 'Confirm',
      exact: true,
    });
    this.deleteModal = page.locator('#deleteOrderModal');
    this.confirmDeleteButton = this.deleteModal.getByRole('button', {
      name: 'Delete Order',
      exact: true,
    });
  }

  card(orderNumber: string): Locator {
    return this.cards.filter({
      has: this.page.locator('.order-id').getByText(orderNumber, { exact: true }),
    });
  }

  total(orderNumber: string): Locator {
    return this.card(orderNumber).locator('.order-header strong');
  }

  status(orderNumber: string): Locator {
    return this.card(orderNumber).locator('.order-status');
  }

  /** Visible once the card is expanded. */
  statusSelect(orderNumber: string): Locator {
    return this.card(orderNumber).getByRole('combobox');
  }

  /** `<name> × <qty>` rows, visible once the card is expanded. */
  items(orderNumber: string): Locator {
    return this.card(orderNumber).locator('.order-item');
  }

  /**
   * Opens the card's details. The header toggles them and every re-render collapses all cards again, so
   * this retries until the details stay visible instead of trusting a one-off visibility check.
   */
  @step((orderNumber: string) => `Expand order ${orderNumber}`)
  async expand(orderNumber: string): Promise<this> {
    const details = this.card(orderNumber).locator('.order-details');
    await expect(async () => {
      if (!(await details.isVisible()))
        await this.card(orderNumber).locator('.order-header').click();
      await expect(details).toBeVisible({ timeout: TIMEOUTS.toggle });
    }).toPass({ timeout: TIMEOUTS.action });
    return this;
  }

  /** Selects the status (terminal ones are confirmed in the warning modal) and waits for the PUT. */
  @step((orderNumber: string, status: OrderStatus) => `Change order ${orderNumber} to ${status}`)
  async changeStatus(orderNumber: string, status: OrderStatus): Promise<this> {
    await this.expand(orderNumber);
    const terminal = (TERMINAL_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
    await whileAwaitingApi(this.page, 'PUT', ENDPOINTS.orders, async () => {
      await this.statusSelect(orderNumber).selectOption(status);
      if (terminal) await this.confirmStatusButton.click();
    });
    return this;
  }

  /** Picks a terminal status, then backs out of the warning modal. No request is sent. */
  @step(
    (orderNumber: string, status: OrderStatus) =>
      `Start changing order ${orderNumber} to ${status}, then cancel`,
  )
  async abandonStatusChange(orderNumber: string, status: OrderStatus): Promise<this> {
    await this.expand(orderNumber);
    await this.statusSelect(orderNumber).selectOption(status);
    await this.statusModal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await this.statusModal.waitFor({ state: 'hidden' });
    return this;
  }

  @step((orderNumber: string) => `Delete order ${orderNumber}`)
  async deleteOrder(orderNumber: string): Promise<this> {
    await this.expand(orderNumber);
    await this.card(orderNumber).getByRole('button', { name: 'Delete Order', exact: true }).click();
    await whileAwaitingApi(this.page, 'DELETE', ENDPOINTS.orders, () =>
      this.confirmDeleteButton.click(),
    );
    return this;
  }
}
