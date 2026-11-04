/** Timeouts in milliseconds. */
export const TIMEOUTS = {
  test: 30_000,
  expect: 5_000,
  action: 10_000,
  navigation: 15_000,
  /** How long a click-to-toggle panel may take to open before the page object retries the click. */
  toggle: 1_000,
} as const;

/** Auth artefacts written by tests/setup/auth.setup.ts (gitignored). */
export const AUTH = {
  storageState: '.auth/user.json',
  apiKeyFile: '.auth/apikey.json',
} as const;

export const ROUTES = {
  home: '/',
  market: '/market.html',
  /** Where a successful login lands. */
  profile: '/profile.html',
} as const;

export const ENDPOINTS = {
  login: '/api/login',
  logout: '/api/logout',
  profile: '/api/profile',
  products: '/api/products',
  productsFilter: '/api/products/filter',
  basket: '/api/basket',
  basketClear: '/api/basket/clear',
  orders: '/api/orders',
  reset: '/api/reset',
} as const;

/** Paths as documented in Swagger (`/market/docs`), which differ from what the UI calls. Contract tests only. */
export const DOCUMENTED_ENDPOINTS = {
  groceries: '/api/groceries',
  basketItems: '/api/basket/items',
} as const;

export const TAGS = {
  api: '@api',
  e2e: '@e2e',
  smoke: '@smoke',
  regression: '@regression',
  maintenance: '@maintenance',
  /** Uses the account-wide basket; runs in the single-worker `stateful` project. */
  stateful: '@stateful',
  /** Spends a rate-limited login (10 per 15 min per IP): run once, never with --repeat-each. */
  login: '@login',
} as const;

/** Enum values as the app accepts them (UI selects + Swagger). Types are derived in src/api/types.ts. */
export const SORT_ORDERS = ['asc', 'desc'] as const;

export const TEMPERATURE_ZONES = ['Dry', 'Frozen', 'Chilled', 'Room Temperature'] as const;

export const ORDER_STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

/** Statuses that can never change again (the API returns 400; the UI disables the select). */
export const TERMINAL_ORDER_STATUSES = ['delivered', 'cancelled'] as const;

export const PRODUCT_CATEGORIES = [
  'fresh-produce',
  'meat-seafood',
  'dairy-eggs',
  'bakery',
  'pantry',
  'beverages',
  'snacks',
  'frozen',
  'household',
  'other',
] as const;

/** Test-data generation bounds and naming. */
export const TEST_DATA = {
  namePrefix: 'QA',
  idLength: 8,
  price: { min: 1, max: 50 },
  stock: { min: 10, max: 50 },
  basketQuantity: { min: 1, max: 3 },
  /** Well-formed UUID that never exists, for 404 tests. */
  unknownId: '00000000-0000-0000-0000-000000000000',
  invalidApiKey: 'qac_live_invalid',
} as const;

export const ALLURE = {
  epic: 'Market',
  /** Default `owner` label; a test may override it through `labels({ owner })`. */
  owner: 'QA Automation',
  resultsDir: 'allure-results',
  reportDir: 'allure-report',
  /** Starts the `fixme` reason of a known product defect; the `Known product defect` category matches it. */
  productDefectPrefix: 'PRODUCT DEFECT:',
} as const;

/** scripts/analyze-failures.ts (`npm run analyze`) */
export const ANALYSIS = {
  schemaVersion: 1,
  markdownFile: 'failure-analysis.md',
  jsonFile: 'failure-analysis.json',
  /** The analysis of the run before, kept for the new-vs-recurring comparison. */
  previousFile: 'failure-analysis.previous.json',
  /** Clusters of at least this many tests are flagged as a likely shared root cause. */
  sharedRootCauseMinTests: 2,
  /** Characters of the first member's error kept in the report. */
  messageExcerptLength: 600,
  /** Characters of the normalised first error line kept as a signature. */
  signatureLength: 200,
  /** Characters of a signature shown in a cluster title. */
  titleLength: 100,
} as const;

/** src/reporters/SecretGuard.ts */
export const SECRET_GUARD = {
  /** Written (leak locations only) when the guard fires; CI skips the report upload while it exists. */
  leakFile: 'secret-guard-leak.txt',
  /** Shorter secrets would match ordinary text and raise false alarms. */
  minSecretLength: 6,
} as const;
