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

- `labels({ feature, story, severity, owner })` sets Allure labels (epic `Market` and the default owner `QA Automation` come with `feature`). Each spec sets the feature in `beforeEach` and the story and severity in the test.
- `productDefect(feature, reason)` returns the annotations for a test parked on a known product defect: the `fixme` reason (`PRODUCT DEFECT: …`, which the Allure category matches) plus the epic, feature and owner labels, because a fixme test never runs `beforeEach`.
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

Tests for known product defects keep the correct assertion and are parked with `test.fixme(title, { tag, annotation: productDefect('<Feature>', '<reason>') }, body)`. The reason shows in the report under the **Known product defect** category. They are listed in the ROADMAP notes: negative price accepted, checkout oversell, 500s on concurrent basket adds, `name` vs `product_name` in the filter, the 404 on the documented `/api/basket/items`, and unescaped product names in the UI (stored XSS).

## Reporting

Reporters, in order: `list`, `html`, `AllureRunInfo`, `allure-playwright`, `SecretGuard`.

- `AllureRunInfo` (`src/reporters/AllureRunInfo.ts`) clears `allure-results/` when a run begins, so the report covers that run only, then writes `environment.properties` (base URL, Playwright, browsers, projects, workers, shard, Node, OS, CI) and `executor.json` (GitHub Actions run with build URL, or a local run). Never add a credential to either file.
- `allure-playwright` writes a result per test: epic/feature/story/severity/owner labels, the `@step` tree with request/response attachments, screenshots and videos of failures, and `categories.json`.
- Categories (`src/config/allureCategories.ts`, first match wins): **Known product defect** (skipped with a `PRODUCT DEFECT:` reason), **Auth** (401/403, login failure or 429, missing credentials or api key), **API 5xx**, **API 4xx** (from the `<METHOD> <path> returned <status>:` message that `ApiError` and `whileAwaitingApi` share), **Test defect** (JavaScript error or strict-mode violation), **Locator not found** (`element(s) not found`, or an action timeout whose call log never resolved the locator) and **Timeout**. A failure no rule matches lands in Allure's built-in **Product errors**: usually an assertion mismatch, to triage.
- The regexes are searched anywhere in the message (Allure 3). Never wrap them in `.*` for Allure 2's full-match: a `toHaveText` failure can carry a 100k-character diff, and the wrapping backtracks quadratically and hangs report generation.
- The Allure CLI is the npm `allure` package (Allure 3, no Java). `allurerc.ts` groups the tree by epic → feature → story and passes the same categories, because its Awesome report reads categories from the config, not from `allure-results/categories.json`.
- `SecretGuard` fails any run whose reports would show a secret (see [Secrets in reports](#secrets-in-reports)). It also scans `environment.properties` and `executor.json`.
- Planned (M7): CI publishes the Allure report with history to GitHub Pages.

## Failure analysis

`npm run analyze` (`scripts/analyze-failures.ts`) reads one run's `allure-results` and writes `failure-analysis.md` and `failure-analysis.json` (`schemaVersion` 1). It is rule-based and offline, so it is deterministic and free to run in CI.

1. **Load** (`load.ts`): one outcome per test run: `fullName` + project, plus the `Repetition` parameter under `--repeat-each` (each repetition counts as its own run). Retries are separate results with an excluded `Retry` parameter; a test that failed and then passed on retry is **flaky**. An unreadable result file is skipped and reported. The run id is the executor's build name (`AllureRunInfo`: the CI run number and attempt, or the local start time).
2. **Signals** (`signals.ts`, pure functions) from the final failed attempt:
   - the category, with the same rules as the Allure report (`src/config/allureCategories.ts`)
   - the locator chain, from `Locator: …`, the call log, or a strict-mode violation. Text values a page object does not write as literals (an order number in `getByText(…)`) become `<text>`
   - the endpoint and status, from the `<METHOD> <path> returned <status>` message that `ApiError` and `whileAwaitingApi` share; ids become `:id`
   - the failed step path (the page-object intent, then its action) and the spec line
   - a signature: the first error line with generated names (`QA-<worker>-<id>` → `<name>`), uuids and numbers masked, so the same cause reads the same in every test

   An error can carry a 100k-character diff, so stack frames are parsed one `at …` line at a time, repo paths are found by string search (from the last `src/` or `tests/` segment), and the patterns avoid nested or overlapping repeats.

3. **Component** (`source.ts`): where the cause most likely lives.
   - A locator maps to the `src/pages` file holding the most of its literals, at the deepest one's line.
   - An `ApiError` maps to the `ENDPOINTS` (or `DOCUMENTED_ENDPOINTS`) entry its path matches, then the `src/api` line using that entry in the same form (plain or with an id) with the same verb.
   - A plain-`Error` API failure comes from a page object's `whileAwaitingApi`. Several page objects often wait on the same call, so the failing step decides: the wait whose `@step` title (or, for a wait in an undecorated helper, the titles of the decorated methods calling it) matches the outermost failing step. With no match among several candidates, the component is left empty rather than guessed.
   - Otherwise the first `src/` stack frame outside `node_modules`. A frame in the shared `ApiClient.ts` names the client class instead (`ProductsApi.send` → `src/api/ProductsApi.ts`).

   Boxed `@step` failures carry only the calling spec frame, so these lookups, not the stack, name the page object.

4. **Cluster** (`cluster.ts`): the key is category + locator, else endpoint, else signature. A signature alone is too generic (`expect(received).toBe(expected)`, `Test timeout of Nms exceeded.`), so it is anchored: to the failing step path alone when that is a page-object, client, seeder or hook step (one broken step is one cause, whichever spec calls it), else to the step plus the suite line (a shared helper) or the spec line (a spec-level `expect`). Step titles built from arguments other than names, ids and numbers (`Filter by category bakery`) still separate per value. Clusters are ranked by size, then category (auth and 5xx first). A cluster of 2+ tests is flagged as a likely shared root cause, and each gets a likely class (product defect, test defect, flaky, environment) and a hint.
5. **Compare** (`baseline.ts`): the baseline is the newest of `failure-analysis.json` and `failure-analysis.previous.json` that is not the current run and did not start after it. When that is `failure-analysis.json`, it is kept as `failure-analysis.previous.json`. So re-analysing a run keeps its baseline, and analysing an older results folder (`--results`) neither rotates anything nor becomes the baseline of the next newer run. A run is never its own baseline. Clusters whose key appears in the baseline are **recurring**, the rest **new**, and baseline clusters that no longer fail are **resolved**.
6. **Report** (`render.ts`): a fixed Markdown format (summary, cluster table, one section per cluster, flaky, known product defects, resolved), which the `failure-triager` agent reads (and the CI summary will, in M7).

The error text is masked before it is parsed or shortened, and every string value of the finished analysis gets one more `redactSecrets` pass (`src/utils/secrets.ts`, shared with `SecretGuard`), so no string in `failure-analysis.*` or the console output (step names, test titles, defect reasons, titles carried over from the baseline) can carry the password or api key. When `QACLOUD_PASSWORD` or `.auth/apikey.json` is missing, or the password is too short to match safely, `analyze` warns that it cannot mask that secret. The pure parts are unit-tested with `node:test` (`npm run test:unit`, part of `npm run check`).

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
| Allure 3 CLI (npm `allure`)           | No Java on dev machines or CI; reads the same `allure-results` format                                                      |
| `allure-results` cleared every run    | The report matches the run, like the HTML report; CI history comes from Pages (M7)                                         |
| Rule-based failure analysis (no LLM)  | Deterministic and free; no API key needed in CI                                                                            |
| TypeScript pinned to 6.0.x            | typescript-eslint supports TS < 6.1                                                                                        |
| Bundled Chromium (not branded Chrome) | Runs on every CI image; one `playwright install chromium`                                                                  |
