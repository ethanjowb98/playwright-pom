# Architecture

## Goals

- **Root-cause friendly:** one broken locator or endpoint should show up as one obvious failure cluster, not as many unrelated red tests.
- **Parallel-safe on a shared account:** every test owns its data.
- **Layered:** specs describe behaviour, page objects and API clients know the app, and fixtures wire everything together.

## Layers

```text
            ┌──────────────── tests/ ────────────────┐
            │  api/  e2e/  maintenance/  setup/      │   behaviour + assertions only
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

- `LoginPage.login` sets the password with `evaluate()`, not `fill()`: Playwright titles a fill step `Fill "<value>"`, and the HTML report lists those steps. Never put a credential in a `@step` title or a `fill` / `pressSequentially` call.
- `ApiClient` masks `password`, `api_key` and `Authorization` in its attachments.
- Traces are off everywhere: every request context is traced (the seeder's included), so a trace would carry the `Authorization: <api key>` header into the report. The E2E login spec also records no video or screenshots, since the profile page it lands on is built from `GET /api/profile`, which returns the api key.
- ESLint rejects a credential typed with `fill` / `pressSequentially` / `type` / `insertText` or used in a step title.
- The `SecretGuard` reporter (`src/reporters/SecretGuard.ts`, last in the reporter list) looks for the password, the api key and the session cookie in `.auth/user.json` (each also JSON-escaped or URL-encoded) in step titles and params, errors, annotations, stdout/stderr, text attachments and this run's `allure-results` files (all but images, videos and zips). It names where, never the value, and writes every location to `secret-guard-leak.txt`; CI skips the Playwright report upload while that file exists. It cannot scan screenshots, videos or trace zips, which is why traces are off.
  - A request that fails (timeout, dropped connection) always leaves the `Authorization` header in the call log of Playwright's own request step, which the HTML report shows and Allure does not. Such a location is marked `[request call log]` and does not fail the run, so an app timeout stays a timeout and a retry that passes stays green. Delete `playwright-report/` before sharing it.
  - Any other leak is a test defect: it fails the run and writes `secret-guard-blocking-leak.txt`, and CI skips the Allure upload too. Delete `playwright-report/`, `allure-results/` and `test-results/` and do not upload them.
- A failed Playwright request carries a `Call log:` listing every request header (`Authorization`, the session cookie). `withoutCallLog` (`src/api/requestErrors.ts`) wraps every request `ApiClient` and the setup project send, so the error a test fails with keeps only its first line (`apiRequestContext.fetch: Timeout 10000ms exceeded.`). Playwright also records each request as a step of its own whose error keeps the full call log: allure-playwright runs with `detail: false`, so those steps never reach Allure or Pages, and `SecretGuard` keeps the HTML report (a CI artifact on failure only) out of CI while it shows one. `PLAYWRIGHT_NO_COPY_PROMPT=1` (`playwright.config.ts`) stops the fixture's page snapshot in `error-context.md`; a failed locator assertion still snapshots the page, so tests never assert on the profile page, which shows the api key.

## API layer

- `ApiClient` (`src/api/ApiClient.ts`) is the only place that sends HTTP. It adds `Authorization: <api_key>`, sends and parses JSON, wraps every call in an Allure step (`POST /api/products`) with `request` and `response <status>` attachments (passwords and keys masked), and throws `ApiError { method, path, status, body }` on any non-2xx. The throw happens after the step completes, so an expected 4xx in a passing negative test does not show as a failed step.
- Resource clients (`AuthApi`, `ProductsApi`, `BasketApi`, `OrdersApi`, `MaintenanceApi`) have one method per endpoint, unwrap the response envelope (`{ products }`, `{ items }`, `{ data }`, `{ order }`), and never assert.
- Negative tests assert on the rejection: `await expect(productsApi.getById(id)).rejects.toMatchObject({ status: 404 })`. A client built with `apiKey: null` sends no header (401 tests; `AuthApi` uses the session cookie instead).
- `src/api/types.ts` holds the shapes observed on the live API, because Swagger has no response schemas.
- Invalid-payload (400) tests use the `*Raw` methods (`createRaw`, `updateRaw`, `addRaw`, `filterRaw`), which take an untyped body or query, so the typed methods stay strict. When an invalid call might wrongly succeed, the spec chains `.then((p) => seeder.trackProduct(p))` so the leak is still cleaned up.
- 401 tests build clients with the `apiClientsFor(apiKey | null)` fixture, which covers every endpoint behind the api key. Contract tests use `DocumentedApi`, which calls the Swagger paths verbatim.

## Page layer (`src/pages`)

- `BasePage` holds `open()` (navigate, then the subclass's `waitUntilReady()`), `navigate()` (no wait, for redirects), `reload()`. Native `confirm()` dialogs are answered with `answerDialog` (`src/pages/dialogs.ts`). `LoginPage` drives the home page's login modal. `MarketPage` owns the header (badge, stats, alert), the tabs, and one instance of each component.
- Components are scoped widgets: `ProductGrid`, `FilterSidebar`, `ProductModal`, `ItemDetailsModal`, `BasketPanel`, `OrderSuccessModal`, `OrdersPanel`. Rows and cards are found by their unique name or order number (`grid.card(name)`, `orders.card(orderNumber)`), never by position, because other workers' data shares the page.
- Every intent is a method decorated with `@step('…')` (`src/utils/allure.ts`). It runs as a boxed Playwright step, so it shows in the trace, the HTML report and Allure, and a failure points at the spec line. The same decorator wraps `ApiClient.exchange` (title built from the arguments, e.g. `POST /api/products`) and the `DataSeeder` methods, so the whole suite uses one step mechanism (allure-playwright records `test.step` as an Allure step). Titles name what the step acts on, built from the arguments (for example `Delete "<name>" from its card`), never from credentials. The wrapper is `async` and uses `return await`, which Playwright needs to place a boxed step's failure on the calling spec line.
- The Market page renders client-side and re-renders after each fetch. Each intent that triggers a fetch waits for that API response (`whileAwaitingApi` in `src/pages/network.ts`), and specs then use web-first assertions. A non-2xx response throws right there with method, path, status and body, so a failed save is not reported as an unrelated wait timeout. Negative tests that expect the API to reject a UI action use `awaitApiResponse` (the same wait, without the throw) through an intent such as `ProductModal.saveRejected()`, which returns the status. For forms the browser blocks, `validationMessage` (`src/pages/forms.ts`) reads the native message, which proves no request was sent. No sleeps and no `networkidle`.
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
- `POST /api/reset` wipes every product, basket item and order of the account, so its tests (`tests/maintenance`, `@maintenance`) run in a `maintenance` project that `playwright.config.ts` defines only when the npm script is `test:maintenance` (`npm_lifecycle_event`). A plain `playwright test`, `npm test` and every CI job never see it. Run it alone: anything else using the account meanwhile loses its data.

## Login rate limit

`POST /api/login` allows **10 requests per 15 minutes per IP** (`ratelimit-policy: 10;w=900`). Failed and malformed logins count too. Once the budget is spent, every login returns 429 (including the setup project), and the whole run fails until `Retry-After` passes.

- A full local run spends 4 logins: the two negative API login tests and the two E2E login tests (one valid, one invalid). CI runs them in the nightly run only (see [CI](#ci)). Setup adds 1 only when the saved session is missing or expired. The tests that log in are tagged `@login`: `npm run test:repeat` (`--repeat-each=3`) leaves them out, and `npm run test:login` runs them once. A plain `npm test -- --repeat-each=3` would spend 12 and fail with 429.
- A UI login does not invalidate the setup session.
- `--no-deps` skips the setup project (and its profile check); setup already spends no login while the saved session is valid.
- Tests that need a logged-in session use the `sessionAuthApi` fixture, which reuses the setup cookie instead of logging in again.
- Do not add tests that log in; if one is unavoidable, tag it `@login` and give it `retries: 0`. If the auth tests or setup fail with 429, classify it as **environment** and rerun after the window resets.

## Known app quirks

- The Swagger docs (`/market/docs`) describe `/api/groceries`, `/api/basket/items` and `DELETE /api/basket`, but the UI calls `/api/products`, `/api/basket` and `/api/basket/clear`. They also document counts in the `POST /api/reset` response, which returns the restored products instead. The suite targets what the UI calls, and the contract tests (`contract.api.spec.ts`, plus one in `tests/maintenance`) track each difference.
- `GET /api/products/filter` returns a bare array whose rows use `name`, while every other product endpoint returns `product_name`. `ProductsApi.filter` returns the raw rows (`FilteredProduct`) so tests see the difference.
- Deleting a product, clearing the basket and resetting use native `confirm()` dialogs, which page objects answer through `answerDialog` (`src/pages/dialogs.ts`). It listens only for the duration of the action and fails if no dialog opens, so no handler is left to answer a later dialog. Deleting an order and final status changes (delivered / cancelled) use in-page modals instead.
- The Add / Edit Product modal has no temperature zone or weighted inputs, so UI-created products always have the defaults. Zone and weighted filters are tested with API-seeded products.
- Filtering or sorting refetches the grid and drops the search text, and basket actions re-render the full grid. Specs sort or filter first, then search.
- The header badge counts basket lines, not units. Units are in the `Basket Units` stat.

## Product defects found by the suite

Tests for known product defects keep the correct assertion and are parked with `test.fixme(title, { tag, annotation: productDefect('<Feature>', '<reason>') }, body)`. The reason shows in the report under the **Known product defect** category. They are listed in the ROADMAP notes: a negative price accepted on create and a price of 0 or below on update, checkout oversell, 500s on concurrent basket adds and on a non-integer basket quantity, `name` vs `product_name` in the filter, a misleading 404 when deleting a product that is in an order, unescaped product names in the UI (stored XSS), and the documented paths and responses the API does not serve.

## Reporting

Reporters, in order: `list`, `html`, `AllureRunInfo`, `allure-playwright`, `SecretGuard`. `playwright test --list` keeps only `list`: Playwright runs reporters even for a listing, and the others would replace the last reports with empty or all-skipped ones, or wipe the `allure-results` of a run still in progress.

- `AllureRunInfo` (`src/reporters/AllureRunInfo.ts`) clears `allure-results/` when a run begins, so the report covers that run only, then writes `environment.properties` (base URL, Playwright, browsers, projects, workers, shard, Node, OS, CI) and `executor.json` (GitHub Actions run with build URL, or a local run; CI's publish job adds `reportUrl`). Never add a credential to either file.
- `allure-playwright` runs with `detail: false`: it records our `@step` tree, the `expect` steps and attachments, but not Playwright's request, locator and page steps, because a failed request step keeps every request header. It writes a result per test: epic/feature/story/severity/owner labels, the `@step` tree with request/response attachments, screenshots and videos of failures, and `categories.json`.
- Categories (`src/config/allureCategories.ts`, first match wins): **Known product defect** (skipped with a `PRODUCT DEFECT:` reason), **Auth** (401/403, login failure or 429, missing credentials or api key), **API 5xx**, **API 4xx** (from the `<METHOD> <path> returned <status>:` message that `ApiError` and `whileAwaitingApi` share), **Test defect** (JavaScript error or strict-mode violation), **Locator not found** (`element(s) not found`, or an action timeout whose call log never resolved the locator) and **Timeout**. A failure no rule matches lands in Allure's built-in **Product errors**: usually an assertion mismatch, to triage.
- The regexes are searched anywhere in the message (Allure 3). Never wrap them in `.*` for Allure 2's full-match: a `toHaveText` failure can carry a 100k-character diff, and the wrapping backtracks quadratically and hangs report generation.
- The Allure CLI is the npm `allure` package (Allure 3, no Java). `allurerc.ts` groups the tree by epic → feature → story and passes the same categories, because its Awesome report reads categories from the config, not from `allure-results/categories.json`.
- History: every `allure generate` appends the run to `allure-history.jsonl` (`historyPath`, last `ALLURE.historyLimit` = 20 runs), which feeds the trend charts and each test's history tab. Locally the file builds up across your own runs (gitignored); CI carries it on the `gh-pages` branch (see [CI](#ci)).
- `SecretGuard` keeps any report that would show a secret out of CI, and fails the run unless the leak is only a failed request's call log (see [Secrets in reports](#secrets-in-reports)). It also scans `environment.properties` and `executor.json`.

## Failure analysis

`npm run analyze` (`scripts/analyze-failures.ts`) reads one run's `allure-results` and writes `failure-analysis.md` and `failure-analysis.json` (`schemaVersion` 1). It is rule-based and offline, so it is deterministic and free to run in CI.

1. **Load** (`load.ts`): one outcome per test run: `fullName` + project, plus the `Repetition` parameter under `--repeat-each` (each repetition counts as its own run). Retries are separate results with an excluded `Retry` parameter; a test that failed and then passed on retry is **flaky**. An unreadable result file is skipped and reported. The run id is the executor's build name (`AllureRunInfo`: the CI run number and attempt, or the local start time).
2. **Signals** (`signals.ts`, pure functions) from the final failed attempt:
   - the category, with the same rules as the Allure report (`src/config/allureCategories.ts`)
   - the locator chain, from `Locator: …`, the call log, or a strict-mode violation. Text values a page object does not write as literals (an order number in `getByText(…)`) become `<text>`
   - the endpoint and status, from the `<METHOD> <path> returned <status>` message that `ApiError` and `whileAwaitingApi` share; ids become `:id`
   - the failed step path (the page-object intent, or the spec-level `expect`; Allure records no Playwright action steps, `detail: false`) and the spec line
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
6. **Report** (`render.ts`): a fixed Markdown format (summary, cluster table, one section per cluster, flaky, known product defects, resolved), which the `failure-triager` agent reads and CI posts to the job summary and the pull request.

The error text is masked before it is parsed or shortened, and every string value of the finished analysis gets one more `redactSecrets` pass (`src/utils/secrets.ts`, shared with `SecretGuard`), so no string in `failure-analysis.*` or the console output (step names, test titles, defect reasons, titles carried over from the baseline) can carry the password or api key. When `QACLOUD_PASSWORD` or `.auth/apikey.json` is missing, or the password is too short to match safely, `analyze` warns that it cannot mask that secret. The pure parts are unit-tested with `node:test` (`npm run test:unit`, part of `npm run check`).

## CI

[.github/workflows/playwright.yml](../.github/workflows/playwright.yml) runs on pushes and pull requests to `main`, nightly (03:00 UTC), and on demand (`workflow_dispatch` with a `suite` input: all, api, e2e, smoke). Every `run:` step uses bash with `pipefail`.

```text
check ──┬── api ───────────────┐
        ├── e2e (shard 1/2) ───┤   ┌── report   (pull requests: read-only)
        ├── e2e (shard 2/2) ───┼───┤
        └── stateful ──────────┘   └── publish  (every other run: GitHub Pages)
```

- **check:** actionlint (a pinned, checksum-verified release; it lints the workflow, not the composite actions), then `npm run check`. It decides what the run does:
  - `run-tests` is false for pull requests from forks and from Dependabot, which get no repository secrets. Then no test or report job runs.
  - `publish` is true for every run except pull requests: pushes to `main`, the nightly, and manual runs of any branch or suite. Failing and skipped tests are part of every published report. Partial suites and other branches therefore feed the same trend and analysis baseline as full runs of `main`; the index lists each run's branch and suite to tell them apart.
- **api**, **e2e** (2 shards) and **stateful** run in parallel, each through `.github/actions/run-tests`: setup, `playwright test <slice>`, upload `allure-results-<slice>`, and the HTML report on failure (no HTML report when `SecretGuard` found a leak, and no Allure results either when the leak is more than a failed request's call log).
  - `.github/actions/setup` caches npm and Chromium, keyed on the installed Playwright version. The browser cache is saved right after the install, so a red test run still fills it.
  - Login allows 10 per 15 minutes per IP, and GitHub's runners share outgoing IPs, so the budget is shared by every job of every run in that window. Each test job's setup logs in once (4 per run). The 4 `@login` tests (2 in api, 2 in e2e) run only in the nightly run (`--grep-invert @login` otherwise), so two overlapping runs spend 8. A third run within 15 minutes can still hit 429 in its setup.
- **stateful** is a job of its own because the basket is account-wide. Its `qacloud-account-basket` concurrency group stops two runs (a pull request and `main`, say) from using the basket at the same time. GitHub keeps one waiting job per group: when a third run's stateful job queues, the one already waiting is cancelled, and that run neither reports nor publishes (re-run it).
- **Cancelling:** a new push to a pull request cancels its superseded **api** and **e2e** jobs, never **stateful** (cancelled mid-order, it would leave basket or order data on the account). A run with a cancelled job, or a failed **check**, skips its report. Other runs are never cancelled by a newer one.
- **report** and **publish** share `.github/actions/report`:
  1. download and merge every slice's `allure-results`, dropping the per-slice `Shard` line from the environment. **publish** requires every slice the suite runs (all four for `all` and `smoke`; `api` + `stateful` for `api`; both e2e shards + `stateful` for `e2e`) and fails when one uploaded nothing (an install error, a timeout, a blocking `SecretGuard` leak), so a report with tests missing is never published. **publish** also writes the report URL into `executor.json` here, so each Allure history point links to its report; doing it in this job, not the test jobs, makes **Re-run failed jobs** link the attempt it publishes.
  2. fetch `gh-pages` and restore `allure-history.jsonl` and the last analysis (`npm run report:site -- restore`). Only a missing branch (`git ls-remote` exit code 2) counts as "no site yet"; any other fetch failure stops the job.
  3. `npm run analyze` and `npm run allure:generate`, and upload the report as the `allure-report` artifact (built even after a failed step). A report that will not be published is built as a single `index.html` (`ALLURE_SINGLE_FILE`), because browsers block a multi-file report's data fetches on `file://`. Published reports stay multi-file: failure videos inlined into one file could pass GitHub's 100 MB file limit and fail the `gh-pages` push.
- **report** (pull requests) has a read-only token plus `pull-requests: write`. It writes the analysis to the job summary and, on a pull request, to one comment that each run edits (marked `<!-- failure-analysis -->`, cut at a line boundary past 60,000 characters). Pull requests read the history, so their trend and new-vs-recurring compare against the last published run, but never write it.
- **publish** (every run except pull requests) has `contents: write` and takes turns with other publishing runs (concurrency group `report-site`; as with **stateful**, a third run arriving cancels the one already waiting, which is then never published). It publishes only after every report step succeeded (never with a missing slice, a missing history or a stale analysis):
  - `npm run report:site -- publish` adds the report under `runs/<run number>-<attempt>/`, saves the history, keeps the newest 20 reports, and rewrites `index.html` (the run list) and `latest/`. An unreadable `runs.json` is rebuilt from the `runs/` folders, never emptied. A re-run of a run older than the newest 20 is dropped at once (its point still lands at the end of the Allure history), and the job summary then links no report.
  - The site is pushed as one commit replacing `gh-pages`, so earlier commits and their reports are no longer referenced. The push uses `--force-with-lease` against the fetched commit: if `gh-pages` moved (or appeared) meanwhile, it fails instead of overwriting.
- **Secrets:** the test jobs get `QACLOUD_*` from repository secrets. The report jobs get only the password, to mask it in the analysis. The api key cannot reach them, because each test job's `SecretGuard` checked its Allure results and a job whose Allure results leaked does not upload them. The username is not secret: the login tests type it with `fill`, so it shows in the published reports.

Repository setup: the secrets `QACLOUD_USERNAME`, `QACLOUD_PASSWORD` (optional `QACLOUD_BASE_URL`), and GitHub Pages set to **Deploy from a branch**, `gh-pages`, `/ (root)`, after the first published run (a push to `main`, or a manual run) has created the branch. For a custom Pages domain, set the repository variable `REPORT_SITE_URL`.

## Key decisions

| Decision                              | Why                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| API login in a setup project          | Fast, and avoids repeating UI login in every test                                                                               |
| Clients throw `ApiError` on non-2xx   | Happy paths stay terse; negatives assert on `status`                                                                            |
| Data seeded via API, verified via UI  | Fast and deterministic; UI tests focus on UI behaviour                                                                          |
| One `stateful` project for API + E2E  | The basket is account-wide: basket tests from both suites never overlap; everything else stays parallel                         |
| Cookie-less `apiRequest` for clients  | The built-in `request` inherits the project storageState, so clients would send the session cookie too                          |
| Traces off; `SecretGuard` reporter    | Traces record every request header (api key); the guard keeps a leaking report out of CI and fails the run for a test-made leak |
| Password set with `evaluate()`        | `fill` titles its step with the value, which the HTML and Allure reports list                                                   |
| `@login` tag, `retries: 0`            | Login is rate-limited (10 per 15 min); repeat runs leave these tests out, and CI runs them nightly only                         |
| Expected 4xx thrown after the step    | Passing negative tests show no failed steps                                                                                     |
| Intents wait for their API response   | The UI re-renders after each fetch; no sleeps needed                                                                            |
| Allure 3 CLI (npm `allure`)           | No Java on dev machines or CI; reads the same `allure-results` format                                                           |
| `allure-results` cleared every run    | The report matches the run, like the HTML report; history lives in `allure-history.jsonl` (CI: on `gh-pages`)                   |
| Pages from a one-commit `gh-pages`    | Free hosting with the history beside the reports; replacing the commit keeps the repository from growing with every report      |
| `stateful` as its own CI job          | API and E2E basket tests share one account basket; a concurrency group serialises it across runs                                |
| Every run except PRs publishes        | Every run, failing and skipped tests included, can be inspected on Pages; PR runs keep a read-only token                        |
| Rule-based failure analysis (no LLM)  | Deterministic and free; no API key needed in CI                                                                                 |
| TypeScript pinned to 6.0.x            | typescript-eslint supports TS < 6.1                                                                                             |
| Bundled Chromium (not branded Chrome) | Runs on every CI image; one `playwright install chromium`                                                                       |
