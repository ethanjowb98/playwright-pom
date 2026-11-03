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

Projects `api` and `e2e-chromium` depend on `setup`, so a single login serves the whole run.

## Test data strategy

- Tests never depend on pre-existing data. Each test creates what it needs through the API, using `DataSeeder` (M2).
- Names are unique per worker and run (`QA-<worker>-<uuid>`), so parallel workers never collide.
- The seeder deletes everything it created in fixture teardown, in dependency order (orders → basket → products). Teardown runs even when the test fails.
- `/api/reset` wipes the whole account, so only a serial `@maintenance` test may call it.

## Known app quirks

- The Swagger docs (`/market/docs`) describe `/api/groceries` and `/api/basket/items`, but the UI calls `/api/products` and `/api/basket`. The suite targets what the UI calls, and a contract test tracks the difference.
- Deleting and resetting use native `confirm()` dialogs, so page objects accept them through a `BasePage` helper.

## Reporting (M5–M7)

- Allure (`allure-playwright`) adds epic/feature/story labels, steps for page and API methods, and request/response attachments.
- `scripts/analyze-failures.ts` clusters failures by component and normalised error into `failure-analysis.md`/`.json`.
- CI publishes the Allure report with history to GitHub Pages.

## Key decisions

| Decision                              | Why                                                       |
| ------------------------------------- | --------------------------------------------------------- |
| API login in a setup project          | Fast, and avoids repeating UI login in every test         |
| Data seeded via API, verified via UI  | Fast and deterministic; UI tests focus on UI behaviour    |
| Rule-based failure analysis (no LLM)  | Deterministic and free; no API key needed in CI           |
| TypeScript pinned to 6.0.x            | typescript-eslint supports TS < 6.1                       |
| Bundled Chromium (not branded Chrome) | Runs on every CI image; one `playwright install chromium` |
