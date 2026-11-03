import { type Locator, type Page } from '@playwright/test';

import { ENDPOINTS } from '@config/constants';
import { answerDialog, type DialogResponse } from '@pages/dialogs';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/** Product cards, the search box and the "N products shown" counter on the Products tab. */
export class ProductGrid {
  readonly root: Locator;
  readonly search: Locator;
  readonly resultsCount: Locator;
  readonly cards: Locator;
  /** Card headings (product names) in display order. */
  readonly titles: Locator;
  readonly emptyState: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#productsGrid');
    this.search = page.locator('#productSearch');
    this.resultsCount = page.locator('#resultsCount');
    this.cards = this.root.locator('.card');
    this.titles = this.cards.getByRole('heading');
    this.emptyState = this.root.locator('.empty-state');
  }

  card(name: string): Locator {
    return this.cards.filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }

  price(name: string): Locator {
    return this.card(name).locator('.price');
  }

  stock(name: string): Locator {
    return this.card(name).locator('.stock');
  }

  /** Category label and the zone / "Weighted|Each" chips. */
  category(name: string): Locator {
    return this.card(name).locator('.category');
  }

  chips(name: string): Locator {
    return this.card(name).locator('.meta-chip');
  }

  /** Basket quantity shown between − and + once the product is in the basket. */
  quantity(name: string): Locator {
    return this.card(name).locator('.quantity-control span');
  }

  addButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'ADD', exact: true });
  }

  increaseButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: '+', exact: true });
  }

  decreaseButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: '-', exact: true });
  }

  outOfStockButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Out of Stock', exact: true });
  }

  /** Types like a user: the grid filters client-side on every keyup. */
  @step((text: string) => `Search products for "${text}"`)
  async searchFor(text: string): Promise<this> {
    await this.search.clear();
    await this.search.pressSequentially(text);
    return this;
  }

  @step((name: string) => `Add "${name}" to the basket from its card`)
  async addToBasket(name: string): Promise<this> {
    await whileAwaitingApi(this.page, 'POST', ENDPOINTS.basket, () => this.addButton(name).click());
    return this;
  }

  @step((name: string) => `Increase "${name}" from its card`)
  async increase(name: string): Promise<this> {
    await whileAwaitingApi(this.page, 'PUT', ENDPOINTS.basket, () =>
      this.increaseButton(name).click(),
    );
    return this;
  }

  /** At quantity 1 the app removes the item instead (DELETE). */
  @step((name: string) => `Decrease "${name}" from its card`)
  async decrease(name: string): Promise<this> {
    await whileAwaitingApi(this.page, ['PUT', 'DELETE'], ENDPOINTS.basket, () =>
      this.decreaseButton(name).click(),
    );
    return this;
  }

  @step((name: string) => `Open details of "${name}"`)
  async viewDetails(name: string): Promise<this> {
    await this.card(name).getByTitle('View Details').click();
    return this;
  }

  @step((name: string) => `Edit "${name}" from its card`)
  async edit(name: string): Promise<this> {
    await this.card(name).getByTitle('Edit').click();
    return this;
  }

  /** Clicks delete and answers the `confirm()`; when accepted, waits for the DELETE. Returns the dialog message. */
  @step((name: string) => `Delete "${name}" from its card`)
  async delete(name: string, response: DialogResponse = 'accept'): Promise<string> {
    const click = (): Promise<void> => this.card(name).getByTitle('Delete').click();
    return answerDialog(
      this.page,
      response === 'accept'
        ? () => whileAwaitingApi(this.page, 'DELETE', ENDPOINTS.products, click)
        : click,
      response,
    );
  }
}
