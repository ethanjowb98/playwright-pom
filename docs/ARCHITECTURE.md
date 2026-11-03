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

1. The `setup` project (`tests/setup/auth.setup.ts`) first checks the saved `.auth/user.json`: if `GET /api/profile` still answers for the `.env` user with that cookie, the session is reused and no login is spent. Otherwise it calls `POST /api/login` with the `.env` credentials.
2. `GET /api/profile` returns `{ username, api_key }`.
3. The session cookies are written to `.auth/user.json` (the browser's `storageState`), and the api key to `.auth/apikey.json`.
4. The `e2e-chromium` and `stateful` projects start every page already logged in. API clients send `Authorization: <api_key>`.

Projects `api`, `stateful` and `e2e-chromium` depend on `setup`, so at most one login serves the whole run, and none while the saved session is valid. The setup test carries an `auth` annotation (`reused saved session` or `logged in via API`). The E2E login spec overrides `storageState` with an empty one. The built-in `request` fixture inherits the project's `storageState` (the browser session in the `stateful` project), so every api-key client is built on the `apiRequest` fixture instead: a cookie-less context, so the api key is the only credential in every project.

Tests that log in are tagged `@login` and run with `retries: 0` (a retry spends another rate-limited login), as does the setup project.

## Secrets in reports

- `LoginPage.login` sets the password with `evaluate()`, not `fill()`: Playwright titles a fill step `Fill "<value>"`, and both the HTML report and Allure (`detail: true`) list those steps. Never put a credential in a `@step` title or a `fill` / `pressSequentially` call.
- `ApiClient` masks `password`, `api_key` and `Authorization` in its attachments.
- Traces are off everywhere: every request context is traced (the seeder's included), so a trace would carry the `Authorization: <api key>` header into the report. The E2E login spec also records no video or screenshots, since the profile page it lands on is built from `GET /api/profile`, which returns the api key.
- ESLint rejects a credential typed with `fill` / `pressSequentially` / `type` / `insertText` or used in a step title.
- The `SecretGuard` reporter (`src/reporters/SecretGuard.ts`, last in the reporter list) fails the run if the password or api key (also JSON-escaped or URL-encoded) appears in a step title or params, error, annotation, stdout/stderr, text attachment or this run's `allure-results` files. It names where, never the value, and writes those locations to `secret-guard-leak.txt`; the CI upload step skips while that file exists. It cannot scan screenshots, videos or trace zips, which is why traces are off. If it fires, delete `playwright-report/`, `allure-results/` and `test-results/` and do not upload them.

## API layer

- `ApiClient` (`src/api/ApiClient.ts`) is the only place that sends HTTP. It adds `Authorization: <api_key>`, sends and parses JSON, wraps every call in an Allure step (`POST /api/products`) with `request` and `response <status>` attachments (passwords and keys masked), and throws `ApiError { method, path, status, body }` on any non-2xx. The throw happens after the step completes, so an expected 4xx in a passing negative test does not show as a failed step.
- Resource clients (`AuthApi`, `ProductsApi`, `BasketApi`, `OrdersApi`, `MaintenanceApi`) have one method per endpoint, unwrap the response envelope (`{ products }`, `{ items }`, `{ data }`, `{ order }`), and never assert.
- Negative tests assert on the rejection: `await expect(productsApi.getById(id)).rejects.toMatchObject({ status: 404 })`. A client built with `apiKey: null` sends no header (401 tests; `AuthApi` uses the session cookie instead).
- `src/api/types.ts` holds the shapes observed on the live API, because Swagger has no response schemas.
- Invalid-payload (400) tests use the `*Raw` methods (`createRaw`, `updateRaw`, `addRaw`), which take an untyped body, so the typed methods stay strict. When an invalid call might wrongly succeed, the spec chains `.then((p) => seeder.trackProduct(p))` so the leak is still cleaned up.
- 401 tests build clients with the `apiClientsFor(apiKey | null)` fixture. Contract tests use `DocumentedApi`, which calls the Swagger paths verbatim.

## Page layer (`src/pages`)

- `BasePage` holds `open()` (navigate, then the subclass's `waitUntilReady()`), `navigate()` (no wait, for redirects), `reload()`. Native `confirm()` dialogs are answered with `answerDialog` (`src/pages/dialogs.ts`). `LoginPage` drives the home page's login modal. `MarketPage` owns the header (badge, stats, alert), the tabs, and one instance of each component.
- Components are scoped widgets: `ProductGrid`, `FilterSidebar`, `ProductModal`, `ItemDetailsModal`, `BasketPanel`, `OrderSuccessModal`, `OrdersPanel`. Rows and cards are found by their unique name or order number (`grid.card(name)`, `orders.card(orderNumber)`), never by position, because other workers' data shares the page.
- Every intent is a method decorated with `@step('…')` (`src/utils/allure.ts`). It runs as a boxed Playwright step, so it shows in the trace, the HTML report and Allure, and a failure points at the spec line. The same decorator wraps `ApiClient.exchange` (title built from the arguments, e.g. `POST /api/products`) and the `DataSeeder` methods, so the whole suite uses one step mechanism (allure-playwright records `test.step` as an Allure step). Titles name what the step acts on, built from the arguments (for example `Delete "<name>" from its card`), never from credentials. The wrapper is `async` and uses `return await`, which Playwright needs to place a boxed step's failure on the calling spec line.
- The Market page renders client-side and re-renders after each fetch. Each intent that triggers a fetch waits for that API response (`whileAwaitingApi` in `src/pages/network.ts`), and specs then use web-first assertions. A non-2xx response throws right there with method, path, status and body, so a failed save is not reported as an unrelated wait timeout. No sleeps and no `networkidle`.
- `MarketPage` is "ready" when the username has loaded and the grid, basket and orders containers have all rendered. The basket renders after the grid, so ADD and +/− controls already reflect it.
- Locators follow role → label → `#id` → CSS. Icon-only card buttons use their `title` (`View Details`, `Edit`, `Delete`). Category chips hide their checkbox (`display: none`), so the filter clicks the chip's `label[for=…]`.
- The app never refreshes on its own: data seeded after `open()` needs `marketPage.reload()`.

## Spec helpers (`src/utils`)

- `labels({ feature, story, severity })` sets Allure labels (epic `Market` comes with `feature`). Each spec sets the feature in `beforeEach` and the story and severity in the test.
- `money(n)` formats an amount the way the UI renders it (`$12.50`). `roundMoney(n)` rounds computed prices to cents, as the API stores them, so exact comparisons never fail on floating-point noise.
- `expectProductShape(product, input?)` and `expectOrderTotals(order, lines?)` are the shared assertions. `expectOrderTotals` checks order total = Σ price × qty and that the items match the basket lines.
- Parameterised cases are tables at the top of the spec, looped into one `test()` each.

## Test data strategy

- Tests never depend on pre-existing data. Each test creates what it needs through the API with the `seeder` fixture (`DataSeeder`): `seedProduct(s)`, `seedBasket`, `seedOrder`.
- Factories (`src/data/factories`) build valid payloads with faker; tests override only the fields they care about.
- Names are unique per worker and call (`QA-<worker>-<id> <label>`), so parallel workers never collide and suite data is recognisable by its `QA-` prefix.
- The seeder deletes everything it created in fixture teardown, in dependency order (orders → basket items → products). Teardown runs even when the test fails, treats a 404 as already deleted, and fails the test if anything else is left behind. Records a test creates directly go through `seeder.trackProduct/trackOrder/trackBasketItem`. Records the UI creates are registered before anything can fail: a product by its unique name with `seeder.expectProductNamed(name)` before the form is submitted (teardown deletes whatever exists under that name), and an order from the `POST /api/orders` response that `BasketPanel.placeOrder()` returns (`seeder.trackOrder(await basket.placeOrder())`). As a fallback for a response the test never saw (a timeout while the server still created the order), checkout tests also call `seeder.expectOrderWith(productNames)` first; teardown deletes any order holding one of those unique products.
- `/api/reset` wipes the whole account, so only a serial `@maintenance` test may call it.

## Isolation: the basket is account-wide

Products are owned per record, but the basket belongs to the account, and `POST /api/orders` consumes the **whole** basket. Two workers that use the basket at once corrupt each other's orders. So:

- Any test that touches the basket or places an order is tagged `@stateful`.
- `@stateful` tests, API and E2E, run in one `stateful` project with `workers: 1`, so an API basket test and a UI checkout can never overlap. The `api` and `e2e-chromium` projects exclude them and stay fully parallel.
- `npm run test:api` and `npm run test:e2e` narrow the shared project with `--grep @api` / `--grep @e2e` (CLI grep and project grep combine with AND).
- `seedOrder` checks that the basket holds only the items it seeded, and fails with a clear message otherwise.

## Login rate limit

`POST /api/login` allows **10 requests per 15 minutes per IP** (`ratelimit-policy: 10;w=900`). Failed and malformed logins count too. Once the budget is spent, every login returns 429 (including the setup project), and the whole run fails until `Retry-After` passes.

- A full run spends 4 logins: the two negative API login tests and the two E2E login tests (one valid, one invalid). Setup adds 1 only when the saved session is missing or expired. The tests that log in are tagged `@login`: `npm run test:repeat` (`--repeat-each=3`) leaves them out, and `npm run test:login` runs them once. A plain `npm test -- --repeat-each=3` would spend 12 and fail with 429.
- A UI login does not invalidate the setup session.
- `--no-deps` skips the setup project (and its profile check); setup already spends no login while the saved session is valid.
- Tests that need a logged-in session use the `sessionAuthApi` fixture, which reuses the setup cookie instead of logging in again.
- Do not add tests that log in; if one is unavoidable, tag it `@login` and give it `retries: 0`. If the auth tests or setup fail with 429, classify it as **environment** and rerun after the window resets.

## Known app quirks

- The Swagger docs (`/market/docs`) describe `/api/groceries` and `/api/basket/items`, but the UI calls `/api/products` and `/api/basket`. The suite targets what the UI calls, and a contract test tracks the difference.
- `GET /api/products/filter` returns a bare array whose rows use `name`, while every other product endpoint returns `product_name`. `ProductsApi.filter` returns the raw rows (`FilteredProduct`) so tests see the difference.
- Deleting a product, clearing the basket and resetting use native `confirm()` dialogs, which page objects answer through `answerDialog` (`src/pages/dialogs.ts`). It listens only for the duration of the action and fails if no dialog opens, so no handler is left to answer a later dialog. Deleting an order and final status changes (delivered / cancelled) use in-page modals instead.
- The Add / Edit Product modal has no temperature zone or weighted inputs, so UI-created products always have the defaults. Zone and weighted filters are tested with API-seeded products.
- Filtering or sorting refetches the grid and drops the search text, and basket actions re-render the full grid. Specs sort or filter first, then search.
- The header badge counts basket lines, not units. Units are in the `Basket Units` stat.

## Product defects found by the suite

Tests for known product defects keep the correct assertion and are marked `test.fixme()` with a `// PRODUCT DEFECT:` comment. They are listed in the ROADMAP notes: negative price accepted, checkout oversell, 500s on concurrent basket adds, `name` vs `product_name` in the filter, the 404 on the documented `/api/basket/items`, and unescaped product names in the UI (stored XSS).

## Reporting (M5–M7)

- Allure (`allure-playwright`) adds epic/feature/story labels, steps for page and API methods, and request/response attachments.
- `SecretGuard` fails any run whose reports would show a secret (see [Secrets in reports](#secrets-in-reports)).
- `scripts/analyze-failures.ts` clusters failures by component and normalised error into `failure-analysis.md`/`.json`.
- CI publishes the Allure report with history to GitHub Pages.

## Key decisions

| Decision                              | Why                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| API login in a setup project          | Fast, and avoids repeating UI login in every test                                                                          |
| Clients throw `ApiError` on non-2xx   | Happy paths stay terse; negatives assert on `status`                                                                       |
| Data seeded via API, verified via UI  | Fast and deterministic; UI tests focus on UI behaviour                                                                     |
| One `stateful` project for API + E2E  | The basket is account-wide: basket tests from both suites never overlap; everything else stays parallel                    |
| Cookie-less `apiRequest` for clients  | The built-in `request` inherits the project storageState, so clients would send the session cookie too                     |
| Traces off; `SecretGuard` reporter    | Traces record every request header (api key); the guard fails any run whose reports show a secret and blocks the CI upload |
| Password set with `evaluate()`        | `fill` titles its step with the value, which the HTML and Allure reports list                                              |
| `@login` tag, `retries: 0`            | Login is rate-limited (10 per 15 min); repeat runs leave these tests out                                                   |
| Expected 4xx thrown after the step    | Passing negative tests show no failed steps                                                                                |
| Intents wait for their API response   | The UI re-renders after each fetch; no sleeps needed                                                                       |
| Rule-based failure analysis (no LLM)  | Deterministic and free; no API key needed in CI                                                                            |
| TypeScript pinned to 6.0.x            | typescript-eslint supports TS < 6.1                                                                                        |
| Bundled Chromium (not branded Chrome) | Runs on every CI image; one `playwright install chromium`                                                                  |
