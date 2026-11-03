import { type Locator, type Page } from '@playwright/test';

import { type ProductInput } from '@api/types';
import { ENDPOINTS } from '@config/constants';
import { whileAwaitingApi } from '@pages/network';
import { step } from '@utils/allure';

/** Fields the Add / Edit Product modal offers. It has no temperature zone or weighted inputs. */
export type ProductForm = Partial<
  Pick<ProductInput, 'product_name' | 'category' | 'price' | 'stock' | 'details'>
>;

/** Add / Edit Product modal (`#productModal`). */
export class ProductModal {
  readonly root: Locator;
  readonly title: Locator;
  readonly name: Locator;
  readonly category: Locator;
  readonly price: Locator;
  readonly stock: Locator;
  readonly detailsTable: Locator;
  readonly addDetailButton: Locator;
  readonly detailKey: Locator;
  readonly detailValue: Locator;
  readonly confirmDetailButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#productModal');
    this.title = page.locator('#productModalTitle');
    this.name = page.locator('#productName');
    this.category = page.locator('#productCategory');
    this.price = page.locator('#productPrice');
    this.stock = page.locator('#productStock');
    this.detailsTable = page.locator('#detailsTable');
    this.addDetailButton = this.root.getByRole('button', { name: '+ Add detail', exact: true });
    this.detailKey = page.locator('#detailKey');
    this.detailValue = page.locator('#detailValue');
    this.confirmDetailButton = page.locator('#detailsEditor').getByRole('button', { name: 'OK' });
    this.saveButton = this.root.getByRole('button', { name: 'Save Product', exact: true });
    this.cancelButton = this.root
      .locator('.form-actions')
      .getByRole('button', { name: 'Cancel', exact: true });
  }

  /** Fills only the given fields; details are added as extra key/value rows. */
  @step('Fill the product form')
  async fill({ product_name, category, price, stock, details }: ProductForm): Promise<this> {
    if (product_name !== undefined) await this.name.fill(product_name);
    if (category !== undefined) await this.category.selectOption(category);
    if (price !== undefined) await this.price.fill(String(price));
    if (stock !== undefined) await this.stock.fill(String(stock));
    for (const [key, value] of Object.entries(details ?? {})) {
      await this.addDetail(key, String(value));
    }
    return this;
  }

  @step((key: string) => `Add product detail "${key}"`)
  async addDetail(key: string, value: string): Promise<this> {
    await this.addDetailButton.click();
    await this.detailKey.fill(key);
    await this.detailValue.fill(value);
    await this.confirmDetailButton.click();
    return this;
  }

  /** Saves a valid form: waits for the POST/PUT and for the modal to close. */
  @step('Save the product')
  async save(): Promise<this> {
    await whileAwaitingApi(this.page, ['POST', 'PUT'], ENDPOINTS.products, () =>
      this.saveButton.click(),
    );
    await this.root.waitFor({ state: 'hidden' });
    return this;
  }

  /** The browser's native validation message for a required field; empty when the field is valid. */
  validationMessage(field: Locator): Promise<string> {
    return field.evaluate((el) => (el as HTMLInputElement | HTMLSelectElement).validationMessage);
  }

  /** Clicks Save without waiting for a request, for forms the browser's validation should block. */
  @step('Try to save the product')
  async trySave(): Promise<this> {
    await this.saveButton.click();
    return this;
  }

  @step('Cancel the product modal')
  async cancel(): Promise<this> {
    await this.cancelButton.click();
    await this.root.waitFor({ state: 'hidden' });
    return this;
  }
}
