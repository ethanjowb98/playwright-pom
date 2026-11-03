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
  - `POST /api/reset` wipes the whole account. Only a serial `@maintenance` test may call it.
- Delete and reset actions open `confirm()` dialogs, so accept them through the `BasePage` dialog helper.
- Credentials come only from `.env` (local) or GitHub Secrets (CI): `QACLOUD_BASE_URL`, `QACLOUD_USERNAME`, `QACLOUD_PASSWORD`. Never read `.env` or `.auth/`, and never print secrets.

## Architecture

```text
src/config      env + constants (timeouts, enums), with no magic numbers elsewhere
src/api         ApiClient base (auth header, JSON, Allure attachments) + one client per resource + types.ts
src/pages       BasePage, LoginPage, MarketPage; components/ for widgets (ProductGrid, ProductModal, BasketPanel, OrdersPanel, FilterSidebar, ItemDetailsModal)
src/data        factories/ (faker builders with overrides) + DataSeeder (API test-data generation with tracked cleanup)
src/fixtures    test.extend: api clients, seeder, page objects, all injected
tests/setup     auth.setup.ts: logs in once and saves storageState + api key
tests/api       *.api.spec.ts
tests/e2e       *.spec.ts
scripts/        analyze-failures.ts (rule-based failure clustering)
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
  - **Isolation:** unique per-worker data names and no dependence on test order, so `fullyParallel` stays on.
  - **Durability:** re-read after a write (fresh GET or reload).
- **Allure:** epic `Market`, a feature per domain, and `step` wrappers in page and API methods. Requests and responses are attached.

## Commands

| Purpose             | Command                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| All tests           | `npm test`                                                                                 |
| API / E2E / smoke   | `npm run test:api` / `npm run test:e2e` / `npm run test:smoke`                             |
| Lint, format, types | `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run check` (all of them) |
| Allure              | `npm run allure:generate`, `npm run allure:open`                                           |
| Failure clustering  | `npm run analyze` writes `failure-analysis.md` and `.json`                                 |

## Definition of done (every new or changed test)

1. `npm run check` passes.
2. `npx playwright test <file> --repeat-each=3` passes. Use `--workers=4` for E2E.
3. Allure metadata and tags are present, and the data is seeded and cleaned up through `seeder`.
4. The ROADMAP task is ticked.
5. README and `docs/` are updated for any new command, folder, convention or decision.

## Triage

Use `/triage`, which runs the tests, then `npm run analyze`, then the `failure-triager` agent.

- Start with the largest cluster, because one root cause often explains many failures.
- Classify each cause as product defect, test defect, flaky or environment.
- For a product defect, keep the correct assertion, mark the test `test.fixme()` with a `// PRODUCT DEFECT:` comment, and log it in ROADMAP.

## Claude tooling in this repo

- Agents:
  - `sdet-test-author`, `failure-triager`, `test-reviewer`
  - Playwright: `playwright-test-planner`, `playwright-test-generator`, `playwright-test-healer`. The healer may only change locators and waits.
- Skills: `/new-page-object`, `/new-api-client`, `/triage`, `/coverage-gaps`.
- Hooks:
  - A git-write guard.
  - `eslint --fix` on every edited `.ts` file.
  - A typecheck before stopping.
