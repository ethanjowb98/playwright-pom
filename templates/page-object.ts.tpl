import { type Locator, type Page } from '@playwright/test';

import { BasePage } from '@pages/BasePage';
import { step } from '@utils/allure';

/**
 * __NAME__ page (`__ROUTE__`).
 * Locators → constructor → intent methods. No assertions here (web-first waits only).
 */
export class __NAME__Page extends BasePage {
  readonly heading: Locator;

  constructor(page: Page) {
    super(page, '__ROUTE__');
    this.heading = page.getByRole('heading', { level: 1 });
  }

  @step('Open __NAME__ page')
  override async open(): Promise<this> {
    await super.open();
    await this.heading.waitFor();
    return this;
  }
}
