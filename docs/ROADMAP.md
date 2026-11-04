# Roadmap: qacloud.dev Market test automation

Status key: ⬜ not started · 🟡 in progress · ✅ done

Workflow: one branch and one PR per milestone (`feat/m<N>-<slug>` → `main`). Claude implements the work and hands off. The maintainer commits, pushes and opens the PR.

## Summary

| #   | Milestone                        | Status | Branch                     | PR  | Completed  |
| --- | -------------------------------- | ------ | -------------------------- | --- | ---------- |
| M0  | Tracking + Claude environment    | ✅     | `feat/m0-claude-env`       |     | 2026-11-03 |
| M1  | Foundation, linting & templates  | ✅     | `feat/m1-foundation`       |     | 2026-11-03 |
| M2  | API layer + test data generation | ✅     | `feat/m2-api-layer`        |     | 2026-11-03 |
| M3  | API test suite                   | ✅     | `feat/m3-api-tests`        |     | 2026-11-03 |
| M4  | Page objects + E2E suite         | ✅     | `feat/m4-e2e`              |     | 2026-11-03 |
| M5  | Allure reporting                 | ✅     | `feat/m5-allure`           |     | 2026-11-04 |
| M6  | Failure analysis                 | ✅     | `feat/m6-failure-analysis` |     | 2026-11-04 |
| M7  | CI/CD pipeline                   | 🟡     | `feat/m7-ci`               |     |            |
| M8  | Final polish & hardening         | ⬜     | `feat/m8-hardening`        |     |            |

Progress: **83 / 90 tasks**

---

## M0: Tracking + Claude environment ✅

- [x] `docs/ROADMAP.md` progress tracker
- [x] `CLAUDE.md`: role, git rules, target app facts, architecture, standards, definition of done
- [x] `.claude/settings.json`: permission allow/deny lists (no commit/push), hooks wiring, project MCP enabled
- [x] `.claude/hooks/block-git-writes.mjs`: PreToolUse guard (verified: it blocks commit/push/merge/rebase/reset --hard/gh pr, including chained commands)
- [x] `.claude/hooks/lint-edited-file.mjs` (PostToolUse eslint --fix) and `typecheck-on-stop.mjs` (Stop). Both stay inactive until M1 installs ESLint/TypeScript
- [x] Agents: `sdet-test-author`, `failure-triager`, `test-reviewer`
- [x] Skills: `/new-page-object`, `/new-api-client`, `/triage`, `/coverage-gaps`
- [x] Playwright Test Agents (`init-agents --loop=claude`): planner/generator/healer + `.mcp.json`, with project guardrails appended
- [x] `.gitignore`: ignore `.claude/settings.local.json`
- [x] Bump Playwright to 1.64.1 (matches CI `ubuntu-latest`, Ubuntu 26.04)
- [x] **Exit:** maintainer has reviewed and merged the M0 PR

## M1: Foundation, linting & templates ✅

- [x] Delete legacy BPOSeats code: `pages/`, `test-data/`, `tests/login.spec.ts`, `tests/milestone.spec.ts`, `response.json`
- [x] `.gitignore` fixes (stop ignoring `.github`/`.vscode`; add `.env`, `.auth/`, `allure-*`, `failure-analysis.*`) + `.gitattributes` (LF)
- [x] Deps: `allure-playwright`, `allure-js-commons`, `@faker-js/faker`, `dotenv`, `typescript` (pinned 6.0.x for typescript-eslint), `tsx` (Allure CLI moved to M5)
- [x] `tsconfig.json` (strict, path aliases)
- [x] ESLint flat config (typescript-eslint type-checked, playwright, import) + Prettier + EditorConfig + markdownlint
- [x] Husky + lint-staged (pre-commit) + commitlint (one-line Conventional Commits)
- [x] VS Code `settings.json` + `extensions.json` (format and fix on save)
- [x] npm scripts: `test`, `test:api`, `test:e2e`, `test:smoke`, `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `check`
- [x] `src/config/env.ts` + `constants.ts`, `.env.example`
- [x] `playwright.config.ts` rewrite (projects: setup / api / e2e-chromium; reporters; timeouts; retries)
- [x] `tests/setup/auth.setup.ts` (API login → storageState + api key)
- [x] `templates/*.tpl` code scaffolds
- [x] `.github/pull_request_template.md` + issue templates (bug report, test task, flaky test)
- [x] `specs/_template.md` + rewrite `specs/README.md`, `tests/seed.spec.ts` for Market
- [x] Interim CI workflow: `check` job + Chromium-only test job with secrets (full pipeline in M7)
- [x] Docs: README (requirements, build-out, scripts, structure, CI), `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, `templates/README.md`
- [x] **Exit:** `npm run check` passes; commitlint rejects bad messages; setup logs in via API and the seed test passes with the stored session (`--repeat-each=3`)

## M2: API layer + test data generation ✅

- [x] `src/api/types.ts` (Product, BasketItem, Order, OrderStatus, Profile)
- [x] `ApiClient` base (auth header, JSON, error handling, Allure request/response attachments)
- [x] `AuthApi`, `ProductsApi`, `BasketApi`, `OrdersApi`, `MaintenanceApi`
- [x] `productFactory` (faker, overrides, unique worker-scoped names)
- [x] `DataSeeder` (seedProducts, seedBasket, seedOrder) with tracked cleanup (orders → basket → products)
- [x] `stateful` project (`@stateful`, 1 worker) for tests that use the account-wide basket
- [x] `src/fixtures/index.ts` (API clients, apiKey, seeder with auto-teardown)
- [x] Smoke API spec proving that seeding and cleanup leave no leftovers
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [x] **Exit:** smoke spec green with `--repeat-each=3`

## M3: API test suite ✅

- [x] Products: create, read (list/by id), update, delete
- [x] Products: sort + filter (category, temperature zone, weighted), parameterised
- [x] Products negatives: missing fields / invalid price → 400, no key → 401, unknown id → 404
- [x] Basket: add, increment, update qty, remove, clear; over-stock rejected
- [x] Orders: place from basket, read, update status (all transitions), update notes, delete
- [x] ACID: order atomicity (empty basket → no order), consistency (totals, stock, basket cleared), isolation (concurrent basket PUTs), durability (re-read)
- [x] Auth: login ok / bad credentials / profile returns api_key
- [x] Contract: docs `/api/groceries` vs implementation `/api/products`
- [x] Assertion helpers (`expectProductShape`, `expectOrderTotals`)
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [x] **Exit:** `test:api` green (known product defects marked and logged) with `--repeat-each=3`

## M4: Page objects + E2E suite ✅

- [x] `BasePage` (navigation, ready-wait), dialog helper (`src/pages/dialogs.ts`), `LoginPage`, `MarketPage` (header, alert, tabs)
- [x] Components: `ProductGrid`, `ProductModal`, `FilterSidebar`, `ItemDetailsModal`, `BasketPanel`, `OrdersPanel` (+ `OrderSuccessModal`)
- [x] Page-object fixtures
- [x] E2E products: add via modal, edit, delete, view details
- [x] E2E search / sort / filters
- [x] E2E basket: add, +/-, remove, clear, out-of-stock disables ADD, count badge matches the API
- [x] E2E checkout: success modal → order shown in Orders tab, basket emptied
- [x] E2E orders: change status, delete
- [x] E2E login: valid / invalid / no session (empty `storageState` via `test.use`)
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [x] **Exit:** `test:e2e` green with `--repeat-each=3 --workers=4` (`@login` tests once)

## M5: Allure reporting ✅

- [x] `src/utils/allure.ts` helpers: `labels()` (epic/feature/story/severity/owner), `productDefect()`, the `@step` decorator
- [x] Steps on all page-object and API-client methods; request/response attachments
- [x] `categories.json` from `src/config/allureCategories.ts` (Known product defect, Auth, API 5xx, API 4xx, Test defect, Locator not found, Timeout), each verified against a real failure
- [x] `environment.properties` + `executor.json` (`AllureRunInfo` reporter, which also clears `allure-results/` per run)
- [x] Allure CLI dependency (npm `allure` 3.x, no Java) + `allurerc.ts` + scripts `allure:generate`, `allure:open`
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [x] **Exit:** local report shows the epic/feature tree, steps, attachments and categories

## M6: Failure analysis ✅

- [x] `scripts/analyze-failures.ts` + `scripts/failure-analysis/`: parse results, normalise error signatures (names, ids, numbers masked)
- [x] Extract component (page-object or API-client line from the locator / endpoint, else a `src/` stack frame), endpoint + status (error message), locator, failing step
- [x] Cluster + classify + rank; flag "likely shared root cause" and flaky (passed on retry)
- [x] `failure-analysis.md` (fixed format) + `failure-analysis.json` (schemaVersion 1)
- [x] New-vs-recurring comparison against the previous run
- [x] `npm run analyze` script
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [x] Unit tests (`node:test`, `npm run test:unit`, part of `npm run check`)
- [x] **Exit:** a deliberately broken locator/endpoint produces a single cluster naming the cause (`.price` → 1 cluster at `ProductGrid.ts`; filter endpoint → 1 cluster at `ProductsApi.ts`)

## M7: CI/CD pipeline 🟡

- [x] Workflow triggers: push/PR to main, `workflow_dispatch` (suite input), nightly cron
- [x] Jobs: `check` (lint/format/types/unit + actionlint), `api`, `e2e` (2 shards), `stateful` (account-wide concurrency group), `report` (pull requests, read-only) / `publish` (every other run, failing and skipped tests included)
- [x] npm + Playwright browser caching; secrets wired (composite actions `setup`, `run-tests`, `report`)
- [x] Allure history from `gh-pages`, generate, deploy to Pages (keep last 20): `scripts/report-site.ts`, unit-tested
- [x] Analysis to `$GITHUB_STEP_SUMMARY` + sticky PR comment
- [x] Repo setup documented: secrets, Pages enabled
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [ ] **Exit:** PR run green, Pages report live, trend visible after the 2nd run

## M8: Final polish & hardening ⬜

- [ ] Final docs pass: README, ARCHITECTURE, CONTRIBUTING reflect the finished suite (reports, analysis, CI)
- [ ] Flake sweep: full suite `--repeat-each=5`
- [ ] `/coverage-gaps` run; close or log the gaps
- [ ] UI negative paths left open by the M4 review: invalid product edit (cleared name, price ≤ 0), Place Order with an empty basket, dismissing Clear All keeps the basket, cancelling the delete-order modal keeps the order, empty login form
- [ ] `test-reviewer` agent pass over the whole repo; findings addressed
- [ ] **Exit:** every box above ticked

---

## Notes / defects found

| Date       | Milestone | Type           | Note                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | M0        | Security       | The password of the legacy BPOSeats login is in git history (old `tests/milestone.spec.ts` and `response.json`). **Rotate it.**                                                                                                                                                                                                                                   |
| 2026-11-03 | M1        | Tooling        | TypeScript pinned to `~6.0` because typescript-eslint 8.x supports TS < 6.1 (TS 7 is the native port). npm blocked esbuild's postinstall; `tsx` works without it.                                                                                                                                                                                                 |
| 2026-11-03 | M2        | Design         | The basket is account-wide and `POST /api/orders` consumes all of it. Basket/order tests (API and E2E) are tagged `@stateful` and run in the single-worker `stateful` project, so they never overlap. `test:api` / `test:e2e` narrow it with `--grep`.                                                                                                            |
| 2026-11-03 | M3        | Product defect | `POST /api/products` accepts `price: -1` (201). `products.api.spec.ts` → `test.fixme`.                                                                                                                                                                                                                                                                            |
| 2026-11-03 | M3        | Product defect | Checkout oversells: when stock drops below a basket quantity before checkout, `POST /api/orders` still returns 201 and clamps stock to 0. Expected 400 with no order and no stock change. `order-integrity.api.spec.ts` → `test.fixme`.                                                                                                                           |
| 2026-11-03 | M3        | Product defect | Concurrent `POST /api/basket` for the same product returns 500 for some requests (5 parallel adds: three 500s, final qty 2). `basket.api.spec.ts` → `test.fixme`.                                                                                                                                                                                                 |
| 2026-11-03 | M3        | Product defect | `GET /api/products/filter` rows use `name`, not `product_name`, unlike every other product endpoint. `product-search.api.spec.ts` → `test.fixme`.                                                                                                                                                                                                                 |
| 2026-11-03 | M3        | Doc drift      | Documented `POST /api/basket/items` returns 404. `contract.api.spec.ts` → `test.fixme`. Documented `/api/groceries` works as an alias of `/api/products` (passing test).                                                                                                                                                                                          |
| 2026-11-03 | M3        | Security       | 400 responses leak raw Postgres errors (`invalid input syntax for type numeric`, check-constraint names). Not asserted; raise with the app owner.                                                                                                                                                                                                                 |
| 2026-11-03 | M3        | Question       | Open orders can move backwards (shipped → pending/processing). Tests assert the forward flow, cancellation and the terminal states only.                                                                                                                                                                                                                          |
| 2026-11-03 | M3        | Question       | Deleting an order does not restore stock (cancelling does). Not asserted until the intended behaviour is confirmed.                                                                                                                                                                                                                                               |
| 2026-11-03 | M3        | Question       | `price: 0` is rejected with the misleading message "product_name/name, price, and category are required" (truthiness check). Not asserted.                                                                                                                                                                                                                        |
| 2026-11-03 | M4        | Product defect | Stored XSS: the grid (and basket, orders, details) render product names via `innerHTML` unescaped. A product named `<i>markup</i>` renders as italic text. `products.spec.ts` → `test.fixme`. Severity: critical on a shared account.                                                                                                                             |
| 2026-11-03 | M4        | Question       | The Add / Edit Product modal has no temperature zone or weighted inputs, so the UI cannot set them (the API can). Zone / weighted filters are tested with API-seeded products.                                                                                                                                                                                    |
| 2026-11-03 | M4        | Question       | The header basket badge counts lines, not units (2 products × 2 units shows `2`). The `Basket Units` stat shows units. Tested as implemented.                                                                                                                                                                                                                     |
| 2026-11-03 | M4        | Defect?        | Typo in the empty basket state: "Your basket is empty. Start marketping!". Cosmetic; not asserted.                                                                                                                                                                                                                                                                |
| 2026-11-03 | M4        | Environment    | `POST /api/login` is rate-limited to 10 per 15 min per IP (429 after). A full run spends 4 logins (the `@login` tests: 2 API + 2 E2E); setup reuses a valid `.auth/` session. `npm run test:repeat` leaves `@login` out. A UI login does not invalidate the setup session.                                                                                        |
| 2026-11-04 | M7        | Design         | CI `stateful` jobs share the concurrency group `qacloud-account-basket`, so two runs never use the basket at once. GitHub keeps one waiting job per group: when a third run's stateful job queues, the one already waiting is cancelled, and that run neither reports nor publishes (re-run it). The `report-site` group of the publish job behaves the same way. |
