import { type Page } from '@playwright/test';

/**
 * Navigation and ready-wait shared by every page (native `confirm()` dialogs: `@pages/dialogs`). Subclasses define what "ready" means.
 * Page objects never assert; they only wait (web-first) for the state an intent leads to.
 */
export abstract class BasePage {
  protected constructor(
    protected readonly page: Page,
    readonly path: string,
  ) {}

  async open(): Promise<this> {
    await this.navigate();
    await this.waitUntilReady();
    return this;
  }

  /** Navigates without waiting for the page to be ready, e.g. when a redirect is expected. */
  async navigate(): Promise<this> {
    await this.page.goto(this.path);
    return this;
  }

  /** Durability: re-reads everything from the server. */
  async reload(): Promise<this> {
    await this.page.reload();
    await this.waitUntilReady();
    return this;
  }

  protected abstract waitUntilReady(): Promise<void>;
}
