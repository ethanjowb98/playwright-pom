/** Timeouts in milliseconds. */
export const TIMEOUTS = {
  test: 30_000,
  expect: 5_000,
  action: 10_000,
  navigation: 15_000,
} as const;

/** Auth artefacts written by tests/setup/auth.setup.ts (gitignored). */
export const AUTH = {
  storageState: '.auth/user.json',
  apiKeyFile: '.auth/apikey.json',
} as const;

export const ROUTES = {
  home: '/',
  market: '/market.html',
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

export const TAGS = {
  api: '@api',
  e2e: '@e2e',
  smoke: '@smoke',
  regression: '@regression',
  maintenance: '@maintenance',
  /** Uses the account-wide basket; runs in the single-worker `api-stateful` project. */
  stateful: '@stateful',
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
} as const;
