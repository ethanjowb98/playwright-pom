# Roadmap: qacloud.dev Market test automation

Status key: ⬜ not started · 🟡 in progress · ✅ done

Workflow: one branch and one PR per milestone (`feat/m<N>-<slug>` → `main`). Claude implements the work and hands off. The maintainer commits, pushes and opens the PR.

## Summary

| #   | Milestone                        | Status | Branch                     | PR  | Completed  |
| --- | -------------------------------- | ------ | -------------------------- | --- | ---------- |
| M0  | Tracking + Claude environment    | ✅     | `feat/m0-claude-env`       |     | 2026-11-03 |
| M1  | Foundation, linting & templates  | ✅     | `feat/m1-foundation`       |     | 2026-11-03 |
| M2  | API layer + test data generation | ✅     | `feat/m2-api-layer`        |     | 2026-11-03 |
| M3  | API test suite                   | ⬜     | `feat/m3-api-tests`        |     |            |
| M4  | Page objects + E2E suite         | ⬜     | `feat/m4-e2e`              |     |            |
| M5  | Allure reporting                 | ⬜     | `feat/m5-allure`           |     |            |
| M6  | Failure analysis                 | ⬜     | `feat/m6-failure-analysis` |     |            |
| M7  | CI/CD pipeline                   | ⬜     | `feat/m7-ci`               |     |            |
| M8  | Final polish & hardening         | ⬜     | `feat/m8-hardening`        |     |            |

Progress: **38 / 88 tasks**

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
- [x] Bump Playwright to 1.64.1 (CI `ubuntu-latest` is now Ubuntu 26.04)
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
- [x] `api-stateful` project (`@stateful`, 1 worker) for tests that use the account-wide basket
- [x] `src/fixtures/index.ts` (API clients, apiKey, seeder with auto-teardown)
- [x] Smoke API spec proving that seeding and cleanup leave no leftovers
- [x] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [x] **Exit:** smoke spec green with `--repeat-each=3`

## M3: API test suite ⬜

- [ ] Products: create, read (list/by id), update, delete
- [ ] Products: sort + filter (category, temperature zone, weighted), parameterised
- [ ] Products negatives: missing fields / invalid price → 400, no key → 401, unknown id → 404
- [ ] Basket: add, increment, update qty, remove, clear; over-stock rejected
- [ ] Orders: place from basket, read, update status (all transitions), update notes, delete
- [ ] ACID: order atomicity (empty basket → no order), consistency (totals, stock, basket cleared), isolation (concurrent basket PUTs), durability (re-read)
- [ ] Auth: login ok / bad credentials / profile returns api_key
- [ ] Contract: docs `/api/groceries` vs implementation `/api/products`
- [ ] Assertion helpers (`expectProductShape`, `expectOrderTotals`)
- [ ] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [ ] **Exit:** `test:api` green (known product defects marked and logged) with `--repeat-each=3`

## M4: Page objects + E2E suite ⬜

- [ ] `BasePage` (navigation, ready-wait, alert, dialog helper), `LoginPage`, `MarketPage`
- [ ] Components: `ProductGrid`, `ProductModal`, `FilterSidebar`, `ItemDetailsModal`, `BasketPanel`, `OrdersPanel`
- [ ] Page-object fixtures
- [ ] E2E products: add via modal, edit, delete, view details
- [ ] E2E search / sort / filters
- [ ] E2E basket: add, +/-, remove, clear, out-of-stock disables ADD, count badge matches the API
- [ ] E2E checkout: success modal → order shown in Orders tab, basket emptied
- [ ] E2E orders: change status, delete
- [ ] E2E login: valid / invalid (no storageState project)
- [ ] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [ ] **Exit:** `test:e2e` green with `--repeat-each=3 --workers=4`

## M5: Allure reporting ⬜

- [ ] `src/utils/allure.ts` helpers (epic/feature/story/severity/owner, step wrapper)
- [ ] Steps on all page-object and API-client methods; request/response attachments
- [ ] `categories.json` (Product defect, Test defect, Locator not found, Timeout, API 4xx, API 5xx, Auth)
- [ ] `environment.properties` + `executor.json`
- [ ] Allure CLI dependency + scripts `allure:generate`, `allure:open`
- [ ] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [ ] **Exit:** local report shows the epic/feature tree, steps, attachments and categories

## M6: Failure analysis ⬜

- [ ] `scripts/analyze-failures.ts`: parse results, normalise error signatures
- [ ] Extract component (stack frame), endpoint + status (attachments), locator, failing step
- [ ] Cluster + classify + rank; flag "likely shared root cause" and flaky (passed on retry)
- [ ] `failure-analysis.md` (fixed format) + `failure-analysis.json` (schemaVersion 1)
- [ ] New-vs-recurring comparison against the previous run
- [ ] `npm run analyze` script
- [ ] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [ ] **Exit:** a deliberately broken locator/endpoint produces a single cluster naming the cause

## M7: CI/CD pipeline ⬜

- [ ] Workflow triggers: push/PR to main, `workflow_dispatch` (suite input), nightly cron
- [ ] Jobs: `check` (lint/format/types + actionlint), `api`, `e2e` (2 shards), `report`
- [ ] npm + Playwright browser caching; secrets wired
- [ ] Allure history from `gh-pages`, generate, deploy to Pages (keep last 20)
- [ ] Analysis to `$GITHUB_STEP_SUMMARY` + sticky PR comment
- [ ] Repo setup documented: secrets, Pages enabled
- [ ] Docs updated (README commands/structure, ARCHITECTURE, CONTRIBUTING as relevant)
- [ ] **Exit:** PR run green, Pages report live, trend visible after the 2nd run

## M8: Final polish & hardening ⬜

- [ ] Final docs pass: README, ARCHITECTURE, CONTRIBUTING reflect the finished suite (reports, analysis, CI)
- [ ] Flake sweep: full suite `--repeat-each=5`
- [ ] `/coverage-gaps` run; close or log the gaps
- [ ] `test-reviewer` agent pass over the whole repo; findings addressed
- [ ] **Exit:** every box above ticked

---

## Notes / defects found

| Date       | Milestone | Type      | Note                                                                                                                                                                                                                    |
| ---------- | --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | M0        | Doc drift | Swagger `/market/docs` documents `/api/groceries` and `/api/basket/items`, but the UI calls `/api/products` and `/api/basket`. To be covered by the M3 contract test.                                                   |
| 2026-11-03 | M0        | Security  | The legacy `tests/milestone.spec.ts` and `response.json` contain a real BPOSeats login and profile data. They get removed in M1, but **the password stays in git history: rotate it.**                                  |
| 2026-11-03 | M1        | Tooling   | TypeScript pinned to `~6.0` because typescript-eslint 8.x supports TS < 6.1 (TS 7 is the native port). npm blocked esbuild's postinstall; `tsx` works without it.                                                       |
| 2026-11-03 | M2        | Design    | The basket is account-wide and `POST /api/orders` consumes all of it. Basket/order tests are tagged `@stateful` and run in the single-worker `api-stateful` project. M4 must keep E2E basket tests from overlapping it. |
| 2026-11-03 | M2        | Defect?   | `POST /api/products` accepts `price: -1` (201). To be asserted in the M3 negatives; mark `test.fixme()` if confirmed.                                                                                                   |
| 2026-11-03 | M2        | Doc drift | `GET /api/products/filter` returns rows with `name` instead of `product_name` (a bare array, not `{ products }`). `ProductsApi.filter` keeps the raw shape for M3.                                                      |
