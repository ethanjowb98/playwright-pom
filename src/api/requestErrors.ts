/**
 * Awaits a Playwright request and rethrows its failure without the `Call log:` section. Playwright lists
 * every request header there (`Authorization: <api key>`, the session cookie), and the error message
 * reaches the HTML report, Allure and `error-context.md`. The first line (`…: Timeout 10000ms exceeded.`)
 * is kept, so the failure still names the cause and lands in the right Allure category.
 */
export async function withoutCallLog<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const [summary = error.message] = error.message.split(/\n\s*Call log:/);
    const clean = new Error(summary.trim());
    clean.name = error.name;
    throw clean;
  }
}
