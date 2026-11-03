import { type Locator, type Page } from '@playwright/test';

import { ROUTES } from '@config/constants';
import { BasePage } from '@pages/BasePage';
import { step } from '@utils/allure';

/**
 * Home page (`/`) with its Login / Register modal. `POST /api/login` is rate-limited
 * (10 per 15 min per IP), so every submit here spends one of those logins.
 */
export class LoginPage extends BasePage {
  readonly openAuthButton: Locator;
  readonly authModal: Locator;
  readonly loginTab: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly submitButton: Locator;
  /** Snackbar shown when the login is rejected. */
  readonly error: Locator;

  constructor(page: Page) {
    super(page, ROUTES.home);
    this.openAuthButton = page.locator('#loginButton');
    this.authModal = page.locator('#authModal');
    this.loginTab = page.locator('#modalLoginTab');
    this.username = page.locator('#loginUsername');
    this.password = page.locator('#loginPassword');
    this.submitButton = page
      .locator('#loginForm')
      .getByRole('button', { name: 'Login', exact: true });
    this.error = page.locator('.snackbar.error');
  }

  @step('Log in through the login modal')
  async login(username: string, password: string): Promise<this> {
    await this.openAuthButton.click();
    await this.loginTab.click();
    await this.username.fill(username);
    // fill() titles its step `Fill "<value>"` in the HTML and Allure reports; evaluate() does not render
    // its argument, so the password never reaches a report. Never add the password to a step title.
    await this.password.evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, password);
    await this.submitButton.click();
    return this;
  }

  protected async waitUntilReady(): Promise<void> {
    await this.openAuthButton.waitFor();
  }
}
