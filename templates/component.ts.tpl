import { type Locator, type Page } from '@playwright/test';

import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/**
 * __NAME__ component, scoped to its root element so locators never leak across widgets.
 */
export class __NAME__ {
  readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('__ROOT_SELECTOR__');
  }

  /** Title names the target (never a credential); wait for the API call the action triggers. */
  @step((name: string) => `__NAME__: example action on "${name}"`)
  async exampleAction(name: string): Promise<this> {
    await whileAwaitingApi(this.page, 'POST', '__API_PATH__', () =>
      this.root.getByRole('button', { name }).click(),
    );
    return this;
  }
}
