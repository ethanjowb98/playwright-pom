# CLAUDE.md — playwright-pom

## Role

Act as a **Senior SDET / Senior AI QA Automation Engineer**. Optimise for reliable, maintainable, parallel-safe tests whose failures point straight at the root cause. When the app and the expected behaviour disagree, report the defect. Never bend the test to pass.

## Git rules (non-negotiable)

- **Never** `git commit`, `git push`, `git merge`, `git rebase`, `git tag`, `git reset --hard`, or `gh pr create/merge`. A `PreToolUse` hook blocks these commands.
- The only allowed git write is creating the milestone branch: `git switch -c feat/m<N>-<slug>` from an up-to-date `main`.
- Finish every milestone with a **handoff** that contains:
  - the files changed
  - the verification output
  - a suggested one-line Conventional Commit, e.g. `feat(m2): add api clients and data seeder` (no body, no footer, max 72 chars)
  - a PR title `[M<N>] <title>`
  - a PR body filled in from `.github/pull_request_template.md`
- Update `docs/ROADMAP.md` (checkboxes, status, notes) at the end of every work session.
- Docs, comments and ROADMAP notes describe the **current state**. Edit them in place; never append a change history or "was / now / renamed" wording (git keeps the history). Remove a note once it is resolved or superseded.

## Target app: qacloud.dev Market

- UI: `https://www.qacloud.dev/market.html`. Login is on `/` (`#loginUsername`, `#loginPassword`, `#loginButton`).
- Auth: `POST /api/login {username, password}` sets a session cookie. `GET /api/profile` returns `{ username, api_key }`. Every market API call needs the header `Authorization: <api_key>`.
- **The UI uses `/api/products`, but the Swagger docs (`/market/docs`) say `/api/groceries`.** Code against `/api/products`. The contract test tracks the difference.
- Endpoints:
  - `GET /api/products?sort=`
  - `GET /api/products/filter?category=&temperature_zone=&weighted=`
  - `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id` (body `{product_name, category, price, stock, details}`)
  - `GET /api/basket`, `POST /api/basket`, `PUT /api/basket` (`{product_id, quantity}`)
  - `DELETE /api/basket/:productId`, `DELETE /api/basket/clear`
  - `GET /api/orders`, `POST /api/orders`
  - `GET /api/orders/:id`, `PUT /api/orders/:id` (`status`: pending|processing|shipped|delivered|cancelled), `DELETE /api/orders/:id`
  - `POST /api/reset` wipes the whole account. Only a serial `@maintenance` test in `tests/maintenance` may call it; that folder runs only via `npm run test:maintenance`, never with the suite or in CI.
- Product delete, basket clear and reset open `confirm()` dialogs, so answer them with the `answerDialog` helper in `src/pages/dialogs.ts`. Order delete and final status changes use in-page modals.
- Credentials come only from `.env` (local) or GitHub Secrets (CI): `QACLOUD_BASE_URL`, `QACLOUD_USERNAME`, `QACLOUD_PASSWORD`. Never read `.env` or `.auth/`, and never print secrets. The secrets are the password and the api key; the username is not one (it shows in published reports).

## Architecture

```text
src/config      env + constants (timeouts, enums), with no magic numbers elsewhere
src/api         ApiClient base (auth header, JSON, Allure attachments) + one client per resource + types.ts
src/pages       BasePage, LoginPage, MarketPage; components/ for widgets (ProductGrid, ProductModal, BasketPanel, OrdersPanel, OrderSuccessModal, FilterSidebar, ItemDetailsModal)
src/data        factories/ (faker builders with overrides) + DataSeeder (API test-data generation with tracked cleanup)
src/fixtures    test.extend: api clients (on a cookie-less apiRequest), seeder, page objects, all injected
src/reporters   AllureRunInfo: clears allure-results, writes environment + executor; SecretGuard: fails the run if a secret reaches a report
tests/setup     auth.setup.ts: reuses a valid saved session or logs in once; saves storageState + api key
tests/api       *.api.spec.ts
tests/e2e       *.spec.ts
tests/maintenance  *.maintenance.spec.ts: the account reset, only via npm run test:maintenance
scripts/        analyze-failures.ts + failure-analysis/ (rule-based failure clustering); report-site.ts + report-site/ (CI Pages site); unit-tested with node:test
.github/        playwright.yml (check → api / e2e ×2 / stateful → publish to Pages, or report on pull requests) + composite actions setup, run-tests, report
templates/      scaffolds for page objects, components, API clients, factories and specs
specs/          Markdown test plans (Playwright planner agent)
docs/ROADMAP.md milestone tracker
```

## Engineering standards

- **POM layering:**
  - Specs contain no raw locators and no `request.*` calls.
  - Page objects contain no assertions, except `expect`-based waits.
  - Locators are `readonly` fields set in the constructor. Methods are user intents that return `this` or the next page.
- **Locators:** `getByRole` → `getByLabel` → stable `#id` → CSS. No XPath, and no emoji or icon text when an id exists.
- **Forbidden:** `waitForTimeout`, `networkidle`, `force: true`, `test.only`, `console.log`, `any` (except at JSON boundaries), and hardcoded credentials or URLs.
- **DRY:**
  - One `ApiClient` base and one factory per entity.
  - Fixtures replace `beforeEach` setup, and components replace duplicated widgets.
  - Shared assertion helpers.
  - Parameterised tests instead of copy-paste.
- **Naming:**
  - PascalCase classes and files; intent-named camelCase methods.
  - Spec files are `*.api.spec.ts` / `*.spec.ts`.
  - Test titles follow `should <behaviour> when <condition>`.
- **Spec layout:**
  - `test.describe('<Feature>')`, with Allure `epic` / `feature` / `story` / `severity` set.
  - Tags: `@api` or `@e2e`, plus `@smoke` or `@regression`.
  - Arrange (seed through the API) → Act → Assert.
- **CRUD:** every resource (Product, Basket item, Order) is covered for Create, Read, Update and Delete through both the API and the UI. Each cell also has negative tests: 400 for an invalid payload, 401 for a missing key, 404 for an unknown id, and a quantity above stock.
- **ACID** applied to tests:
  - **Atomicity:** one behaviour per test, with its own data and guaranteed teardown. A failed order placement leaves no partial state.
  - **Consistency:** check the invariants:
    - order total = Σ price × qty
    - the basket is empty after an order
    - stock decreases by the quantity ordered
    - the UI matches the API
  - **Isolation:** unique per-worker data names and no dependence on test order, so `fullyParallel` stays on. The basket is account-wide, so any test that uses the basket or places an order is tagged `@stateful` and runs in the single-worker `stateful` project.
  - **Durability:** re-read after a write (fresh GET or reload).
- **Allure:** epic `Market`, a feature per domain, owner `QA Automation` (all set by `labels({ feature })`). Requests and responses are attached. Failure categories live in `src/config/allureCategories.ts`: patterns are searched, never wrapped in `.*` (that hangs report generation on long messages).
  - Steps need a running test: `@step` methods cannot run in global setup or worker-scoped fixtures. Specs never call `test.step` directly (ESLint).
  - Steps come only from the `@step` decorator (`@utils/allure`) on page, API-client and seeder methods. Titles name the target, built from the arguments: ``@step((name: string) => `Delete "${name}" from its card`)``.
  - An expected failure (a 4xx in a negative test, a 404 in cleanup) must not show as a failed step: throw after the step completes.
- **Secrets in reports:** Playwright titles `fill` / `pressSequentially` steps with the typed value, and the HTML and Allure reports list them.
  - Never type a credential that way or put one in a step title; set it with `locator.evaluate()` (see `LoginPage`). ESLint blocks the common cases.
  - Traces are off everywhere: every request context is traced, so a trace would carry the `Authorization` header. Login tests and the setup project run with `retries: 0`; the E2E login spec also records no video or screenshots.
  - The `SecretGuard` reporter lists every place the reports show the password, api key or session cookie in `secret-guard-leak.txt` (locations only), which stops the CI Playwright report upload. A failed request (timeout, dropped connection) always leaves the `Authorization` header in its Playwright step's call log, which only the HTML report shows: that is marked `[request call log]` and does not fail the run. Any other leak fails the run and writes `secret-guard-blocking-leak.txt`, which stops the Allure upload too; delete `playwright-report/`, `allure-results/` and `test-results/`.
- **Login budget:** `POST /api/login` allows 10 per 15 min per IP. Don't add tests that log in. Tests that do are tagged `@login`, have `retries: 0`, and run once (`npm run test:login`), never with `--repeat-each`. Setup reuses a valid saved session.
- **API auth:** API clients are built on the cookie-less `apiRequest` fixture, never the built-in `request`, which inherits the project's `storageState` (the session cookie in the `stateful` project).
- **Cleanup of UI-created data:** register it _before_ the action, so a failure between create and track can't leak it.
  - Products: `seeder.expectProductNamed(name)` before submitting the form.
  - Orders: `seeder.expectOrderWith(productNames)` before checkout, then `seeder.trackOrder(await basket.placeOrder())`. Page-object actions that create return the created record from the response.
- **Page-object waits:** each intent waits for the API call it triggers with `whileAwaitingApi`, which throws on a non-2xx. An intent whose call the test expects the API to reject uses `awaitApiResponse` and returns the status (`ProductModal.saveRejected()`). Native dialogs go through `answerDialog`. Never branch on a one-off `isVisible()`; retry with `expect(...).toPass()`.
- **Assertions:** derive expected values from the seeded data, not literals. For a form the browser blocks, assert its `validationMessage` before checking that nothing was created.

## Commands

| Purpose             | Command                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| All tests           | `npm test`                                                                                 |
| API / E2E / smoke   | `npm run test:api` / `npm run test:e2e` / `npm run test:smoke`                             |
| Flakiness check     | `npm run test:repeat -- <spec>` (`--repeat-each=3` without `@login`)                       |
| Login tests         | `npm run test:login` (spends rate-limited logins: run once)                                |
| Account reset tests | `npm run test:maintenance` (`POST /api/reset` wipes the account: run alone, never in CI)   |
| Lint, format, types | `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run check` (all of them) |
| Analyzer unit tests | `npm run test:unit` (also in `npm run check`)                                              |
| Allure              | `npm run allure:generate`, `npm run allure:open`                                           |
| Failure clustering  | `npm run analyze [-- --results <dir>]` writes `failure-analysis.md` and `.json`            |

## Definition of done (every new or changed test)

1. `npm run check` passes.
2. `npm run test:repeat -- <file>` passes (`--repeat-each=3` without `@login`; add `--workers=4` for E2E). `@login` tests pass once via `npm run test:login`.
3. Allure metadata and tags are present, and the data is seeded and cleaned up through `seeder` (UI-created data registered before the action).
4. The ROADMAP task is ticked.
5. README and `docs/` are updated for any new command, folder, convention or decision.

## Triage

Use `/triage`, which runs the tests, then `npm run analyze`, then the `failure-triager` agent.

- Start with the largest cluster, because one root cause often explains many failures.
- Classify each cause as product defect, test defect, flaky or environment.
- For a product defect, keep the correct assertion, mark the test `test.fixme(title, { tag, annotation: productDefect('<Feature>', '<what the app does wrong>') }, body)`, and log it in ROADMAP. The reason lands in the Allure **Known product defect** category.
- A `SecretGuard` failure (`secret-guard-blocking-leak.txt`) is a blocker test defect: fix the leak and delete the local reports. `[request call log]` lines alone are not: triage the failed request, and delete `playwright-report/` before sharing it. A 429 from `/api/login` is environment: wait out the 15-minute window.

## Claude tooling in this repo

- Agents:
  - `sdet-test-author`, `failure-triager`, `test-reviewer`
  - Playwright: `playwright-test-planner`, `playwright-test-generator`, `playwright-test-healer`. The healer may only change locators and waits.
- Skills: `/new-page-object`, `/new-api-client`, `/triage`, `/coverage-gaps`.
- Hooks:
  - A git-write guard.
  - `eslint --fix` on every edited `.ts` file.
  - A typecheck before stopping.
