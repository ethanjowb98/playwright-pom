import { ALLURE } from './constants';

type CategoryStatus = 'failed' | 'broken' | 'skipped';

/** `categories.json` format, which Allure 3 reads from its config and from allure-results. */
export interface AllureCategory {
  name: string;
  description: string;
  matchedStatuses: CategoryStatus[];
  messageRegex?: string;
  traceRegex?: string;
}

const FAILED: CategoryStatus[] = ['failed', 'broken'];

/**
 * Failure categories, first match wins. allure-playwright reports every failure as `failed`, so a
 * failure no rule matches lands in Allure's built-in `Product errors`: mostly assertion mismatches,
 * which are a product defect or a wrong expectation to triage.
 *
 * Allure 3 searches each regex anywhere in the text. Never wrap a pattern in `.*` for Allure 2's
 * full-match: a `toHaveText` diff can be 100k characters, and the wrapping backtracks quadratically,
 * which hangs report generation.
 *
 * The messages come from `ApiError` / `whileAwaitingApi` (`<METHOD> <path> returned <status>: ...`),
 * Playwright's errors (with their call log) and the `fixme` reason set by `productDefect()`.
 * Relative imports only: `allurerc.ts` loads this file outside the tsconfig path aliases.
 */
export const ALLURE_CATEGORIES: AllureCategory[] = [
  {
    name: 'Known product defect',
    description: 'Logged in docs/ROADMAP.md and parked with test.fixme(…, productDefect(…)).',
    matchedStatuses: ['skipped'],
    messageRegex: `^${ALLURE.productDefectPrefix}`,
  },
  {
    name: 'Auth',
    description:
      'Login failed or was rate-limited, the api key was rejected (401/403), or no credentials or api key were configured.',
    matchedStatuses: FAILED,
    messageRegex: String.raw`returned 40[13]:|/api/login returned|Missing required env var|No apiKey in|exposed no api_key`,
  },
  {
    name: 'API 5xx',
    description: 'The server failed a request the test expected to succeed.',
    matchedStatuses: FAILED,
    messageRegex: String.raw`returned 5\d\d:`,
  },
  {
    name: 'API 4xx',
    description:
      'The API rejected a request the test expected to succeed: check the payload or the seeded data.',
    matchedStatuses: FAILED,
    messageRegex: String.raw`returned 4\d\d:`,
  },
  {
    name: 'Test defect',
    description:
      'A bug in the test code: a JavaScript error, or a locator that matches more than one element.',
    matchedStatuses: FAILED,
    traceRegex: String.raw`^(?:TypeError|ReferenceError|SyntaxError|RangeError)\b|strict mode violation`,
  },
  {
    name: 'Locator not found',
    description:
      'The element never appeared: the UI changed, or the page was not in the expected state.',
    matchedStatuses: FAILED,
    messageRegex: String.raw`element\(s\) not found|locator\.\w+: Timeout \d+ms exceeded(?![\s\S]*locator resolved to)`,
  },
  {
    name: 'Timeout',
    description:
      'A wait, action or the whole test ran out of time with the element present: slow app or a missed state change.',
    matchedStatuses: FAILED,
    messageRegex: String.raw`Timeout \d+ms exceeded|Test timeout of \d+ms exceeded`,
  },
];
