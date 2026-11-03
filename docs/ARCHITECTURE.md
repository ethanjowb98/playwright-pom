# Architecture

## Goals

- **Root-cause friendly:** one broken locator or endpoint should show up as one obvious failure cluster, not as many unrelated red tests.
- **Parallel-safe on a shared account:** every test owns its data.
- **Layered:** specs describe behaviour, page objects and API clients know the app, and fixtures wire everything together.

## Layers

```text
            ┌──────────────── tests/ ────────────────┐
            │  api/*.api.spec.ts     e2e/*.spec.ts   │   behaviour + assertions only
            └───────────────┬────────────────────────┘
                            │ fixtures (src/fixtures)
        ┌───────────────────┼─────────────────────────┐
        │                   │                         │
  src/api (clients)   src/data (factories,      src/pages (page objects
  ApiClient base      DataSeeder)                + components)
        │                   │                         │
        └──── HTTP: /api/* ─┴──────── browser: market.html ┘
                         qacloud.dev Market
```

| Layer        | Responsibility                                                                                            | Must not                                    |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Specs        | Arrange / Act / Assert one behaviour; tags + Allure labels                                                | Use raw locators or `request.*`             |
| Fixtures     | Build and inject clients, seeder and page objects; teardown                                               | Contain test logic                          |
| API clients  | One class per resource, typed requests and responses; base adds auth header and Allure attachments        | Assert                                      |
| Data         | Factories (faker + overrides, unique names); `DataSeeder` creates data through the API and tracks cleanup | Use the UI                                  |
| Page objects | Locators as `readonly` fields; intent methods return `this` or the next page                              | Assert (except web-first waits); hard waits |
| Config       | Typed env vars, constants (timeouts, routes, endpoints, tags)                                             | Hold secrets                                |

ESLint enforces the spec rules (`no-restricted-syntax` blocks `page.locator`/`getBy*` and `request.get/post/...` in `tests/`).

## Auth flow

1. The `setup` project (`tests/setup/auth.setup.ts`) calls `POST /api/login` with the `.env` credentials.
2. `GET /api/profile` returns `{ username, api_key }`.
3. The session cookies are written to `.auth/user.json` (the browser's `storageState`), and the api key to `.auth/apikey.json`.
4. The `e2e-chromium` project starts every page already logged in. API clients send `Authorization: <api_key>`.

Projects `api`, `api-stateful` and `e2e-chromium` depend on `setup`, so a single login serves the whole run.

## API layer

- `ApiClient` (`src/api/ApiClient.ts`) is the only place that sends HTTP. It adds `Authorization: <api_key>`, sends and parses JSON, wraps every call in an Allure step (`POST /api/products`) with `request` and `response <status>` attachments (passwords and keys masked), and throws `ApiError { method, path, status, body }` on any non-2xx.
- Resource clients (`AuthApi`, `ProductsApi`, `BasketApi`, `OrdersApi`, `MaintenanceApi`) have one method per endpoint, unwrap the response envelope (`{ products }`, `{ items }`, `{ data }`, `{ order }`), and never assert.
- Negative tests assert on the rejection: `await expect(productsApi.getById(id)).rejects.toMatchObject({ status: 404 })`. A client built with `apiKey: null` sends no header (401 tests; `AuthApi` uses the session cookie instead).
- `src/api/types.ts` holds the shapes observed on the live API, because Swagger has no response schemas.
- Invalid-payload (400) tests use the `*Raw` methods (`createRaw`, `updateRaw`, `addRaw`), which take an untyped body, so the typed methods stay strict. When an invalid call might wrongly succeed, the spec chains `.then((p) => seeder.trackProduct(p))` so the leak is still cleaned up.
- 401 tests build clients with the `apiClientsFor(apiKey | null)` fixture. Contract tests use `DocumentedApi`, which calls the Swagger paths verbatim.

## Spec helpers (`src/utils`)

- `labels({ feature, story, severity })` sets Allure labels (epic `Market` comes with `feature`). Each spec sets the feature in `beforeEach` and the story and severity in the test.
- `expectProductShape(product, input?)` and `expectOrderTotals(order, lines?)` are the shared assertions. `expectOrderTotals` checks order total = Σ price × qty and that the items match the basket lines.
- Parameterised cases are tables at the top of the spec, looped into one `test()` each.

## Test data strategy

- Tests never depend on pre-existing data. Each test creates what it needs through the API with the `seeder` fixture (`DataSeeder`): `seedProduct(s)`, `seedBasket`, `seedOrder`.
- Factories (`src/data/factories`) build valid payloads with faker; tests override only the fields they care about.
- Names are unique per worker and call (`QA-<worker>-<id> <label>`), so parallel workers never collide and suite data is recognisable by its `QA-` prefix.
- The seeder deletes everything it created in fixture teardown, in dependency order (orders → basket items → products). Teardown runs even when the test fails, treats a 404 as already deleted, and fails the test if anything else is left behind. Records a test creates directly go through `seeder.trackProduct/trackOrder/trackBasketItem`.
- `/api/reset` wipes the whole account, so only a serial `@maintenance` test may call it.

## Isolation: the basket is account-wide

Products are owned per record, but the basket belongs to the account, and `POST /api/orders` consumes the **whole** basket. Two workers that use the basket at once corrupt each other's orders. So:

- Any test that touches the basket or places an order is tagged `@stateful`.
- `@stateful` tests run in the `api-stateful` project with `workers: 1`. The `api` project excludes them and stays fully parallel.
- `seedOrder` checks that the basket holds only the items it seeded, and fails with a clear message otherwise.
- E2E basket and checkout tests (M4) must not run at the same time as `api-stateful`.

## Login rate limit

`POST /api/login` allows **10 requests per 15 minutes per IP** (`ratelimit-policy: 10;w=900`). Failed and malformed logins count too. Once the budget is spent, every login returns 429 (including the setup project), and the whole run fails until `Retry-After` passes.

- A run spends 3 logins: setup (1) and the two negative login tests. `--repeat-each=3` spends 7.
- Tests that need a logged-in session use the `sessionAuthApi` fixture, which reuses the setup cookie instead of logging in again.
- Do not add tests that log in. Two full `--repeat-each=3` runs within 15 minutes will exceed the budget. If the auth tests or setup fail with 429, classify it as **environment** and rerun after the window resets.

## Known app quirks

- The Swagger docs (`/market/docs`) describe `/api/groceries` and `/api/basket/items`, but the UI calls `/api/products` and `/api/basket`. The suite targets what the UI calls, and a contract test tracks the difference.
- `GET /api/products/filter` returns a bare array whose rows use `name`, while every other product endpoint returns `product_name`. `ProductsApi.filter` returns the raw rows (`FilteredProduct`) so tests see the difference.
- Deleting and resetting use native `confirm()` dialogs, so page objects accept them through a `BasePage` helper.

## Product defects found by the suite

Tests for known product defects keep the correct assertion and are marked `test.fixme()` with a `// PRODUCT DEFECT:` comment. They are listed in the ROADMAP notes: negative price accepted, checkout oversell, 500s on concurrent basket adds, `name` vs `product_name` in the filter, and the 404 on the documented `/api/basket/items`.

## Reporting (M5–M7)

- Allure (`allure-playwright`) adds epic/feature/story labels, steps for page and API methods, and request/response attachments.
- `scripts/analyze-failures.ts` clusters failures by component and normalised error into `failure-analysis.md`/`.json`.
- CI publishes the Allure report with history to GitHub Pages.

## Key decisions

| Decision                              | Why                                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| API login in a setup project          | Fast, and avoids repeating UI login in every test          |
| `@stateful` single-worker project     | The basket is account-wide; everything else stays parallel |
| Clients throw `ApiError` on non-2xx   | Happy paths stay terse; negatives assert on `status`       |
| Data seeded via API, verified via UI  | Fast and deterministic; UI tests focus on UI behaviour     |
| Rule-based failure analysis (no LLM)  | Deterministic and free; no API key needed in CI            |
| TypeScript pinned to 6.0.x            | typescript-eslint supports TS < 6.1                        |
| Bundled Chromium (not branded Chrome) | Runs on every CI image; one `playwright install chromium`  |
