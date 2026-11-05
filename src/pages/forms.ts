import { type Locator } from '@playwright/test';

/**
 * The browser's native validation message for a form field (`required`, `min`…); empty when the field is
 * valid. A non-empty message means the browser blocked the submit, so no request was sent.
 */
export function validationMessage(field: Locator): Promise<string> {
  return field.evaluate((el) => (el as HTMLInputElement | HTMLSelectElement).validationMessage);
}
