import { type Locator, type Page } from '@playwright/test';

import { step } from '@utils/allure';

/** Read-only Product Details modal opened from a card's view button. */
export class ItemDetailsModal {
  readonly root: Locator;
  readonly title: Locator;
  readonly content: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.root = page.locator('#itemDetailsModal');
    this.title = page.locator('#itemDetailsTitle');
    this.content = page.locator('#itemDetailsContent');
    this.closeButton = this.root.getByRole('button', { name: 'Close', exact: true });
  }

  @step('Close the product details')
  async close(): Promise<this> {
    await this.closeButton.click();
    await this.root.waitFor({ state: 'hidden' });
    return this;
  }
}
