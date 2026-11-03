import { type Locator, type Page } from '@playwright/test';

import { step } from '@utils/allure';

/**
 * __NAME__ component, scoped to its root element so locators never leak across widgets.
 */
export class __NAME__ {
  readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('__ROOT_SELECTOR__');
  }

  @step('__NAME__: example action')
  async exampleAction(): Promise<this> {
    await this.root.getByRole('button', { name: 'Example' }).click();
    return this;
  }
}
