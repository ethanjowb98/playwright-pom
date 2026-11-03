import { type Locator, type Page } from '@playwright/test';

import { ROUTES } from '@config/constants';
import { BasePage } from '@pages/BasePage';
import { step } from '@utils/allure';

/**
 * __NAME__ page (`__ROUTE__`).
 * Locators → constructor → intent methods. No assertions here (web-first waits only).
 * Add the route to ROUTES in src/config/constants.ts and register a fixture in src/fixtures/index.ts.
 */
export class __NAME__Page extends BasePage {
  readonly heading: Locator;

  constructor(page: Page) {
    super(page, ROUTES.__ROUTE_KEY__);
    this.heading = page.getByRole('heading', { level: 1 });
  }

  @step('__NAME__: example intent')
  async exampleIntent(): Promise<this> {
    await this.heading.click();
    return this;
  }

  /** What "loaded" means for this page; `open()` and `reload()` wait for it. */
  protected async waitUntilReady(): Promise<void> {
    await this.heading.waitFor();
  }
}
