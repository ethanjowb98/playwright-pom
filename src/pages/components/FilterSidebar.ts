import { type Locator, type Page } from '@playwright/test';

import { type ProductCategory, type SortOrder, type TemperatureZone } from '@api/types';
import { ENDPOINTS } from '@config/constants';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/**
 * Category checkboxes plus the sort / zone / weighted selects. Every change refetches the grid
 * (`/api/products` without filters, `/api/products/filter` with any), so each intent waits for that GET.
 * Refetching drops any search text, so search after filtering, not before.
 */
export class FilterSidebar {
  readonly sort: Locator;
  readonly zone: Locator;
  readonly weighted: Locator;
  readonly clearButton: Locator;
  readonly activeSummary: Locator;

  constructor(private readonly page: Page) {
    this.sort = page.locator('#sortOrder');
    this.zone = page.locator('#filterTemperatureZone');
    this.weighted = page.locator('#filterWeighted');
    this.clearButton = page.getByRole('button', { name: 'Clear Filters', exact: true });
    this.activeSummary = page.locator('#activeFiltersSummary');
  }

  /** Hidden (`display: none`); read its state, click `categoryChip` instead. */
  categoryCheckbox(category: ProductCategory): Locator {
    return this.page.locator(`#cat-${category}`);
  }

  /** The visible chip label users click. Its text starts with an emoji, so it is located by `for`. */
  categoryChip(category: ProductCategory): Locator {
    return this.page.locator(`label[for="cat-${category}"]`);
  }

  @step((category: ProductCategory) => `Filter by category ${category}`)
  async filterByCategory(category: ProductCategory): Promise<this> {
    await this.refetching(() => this.categoryChip(category).click());
    return this;
  }

  @step((zone: TemperatureZone) => `Filter by temperature zone ${zone}`)
  async filterByZone(zone: TemperatureZone): Promise<this> {
    await this.refetching(() => this.zone.selectOption(zone));
    return this;
  }

  @step((weighted: boolean) => `Filter by ${weighted ? 'weighted' : 'each'}`)
  async filterByWeighted(weighted: boolean): Promise<this> {
    await this.refetching(() => this.weighted.selectOption(weighted ? 'weighted' : 'each'));
    return this;
  }

  /** No-op when already selected: re-selecting the same option fires no change event and no fetch. */
  @step((order: SortOrder) => `Sort products ${order}`)
  async sortBy(order: SortOrder): Promise<this> {
    if ((await this.sort.inputValue()) !== order) {
      await this.refetching(() => this.sort.selectOption(order));
    }
    return this;
  }

  @step('Clear filters')
  async clear(): Promise<this> {
    await this.refetching(() => this.clearButton.click());
    return this;
  }

  private async refetching(action: () => Promise<unknown>): Promise<void> {
    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.products, action);
  }
}
