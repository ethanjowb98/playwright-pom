/** Rounds to cents, as the API stores prices: `7.22 + 1` is `8.219999999999999` in floating point. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Money as the Market UI renders it: `$12.50`. */
export function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
