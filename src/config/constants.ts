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
} as const;

export const TAGS = {
  api: '@api',
  e2e: '@e2e',
  smoke: '@smoke',
  regression: '@regression',
  maintenance: '@maintenance',
} as const;
