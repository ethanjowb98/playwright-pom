# playwright-pom

Playwright + TypeScript test automation for the [qacloud.dev Market](https://www.qacloud.dev/market.html) app, built on the Page Object Model. It covers the **API** and **E2E (UI)** layers and generates its test data through the API. Results are reported with Allure, and a rule-based analysis groups failures by shared root cause.

> Status: under construction, delivered in milestones. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is done and what is next.

## Contents

- [Requirements](#requirements)
- [Build-out (first-time setup)](#build-out-first-time-setup)
- [Running tests](#running-tests)
- [Code quality](#code-quality)
- [Project structure](#project-structure)
- [CI](#ci)
- [Claude Code tooling](#claude-code-tooling)
- [Further documentation](#further-documentation)

## Requirements

| Tool    | Version                                                                      |
| ------- | ---------------------------------------------------------------------------- |
| Node.js | 22 LTS or newer                                                              |
| npm     | 10+                                                                          |
| Git     | any recent version                                                           |
| Account | A verified [qacloud.dev](https://www.qacloud.dev) user (username + password) |

## Build-out (first-time setup)

```bash
# 1. Install dependencies. This also installs the git hooks (husky).
npm ci

# 2. Install the browser used by the e2e project
npx playwright install --with-deps chromium

# 3. Configure credentials
cp .env.example .env
#    then edit .env and set QACLOUD_USERNAME / QACLOUD_PASSWORD

# 4. Verify: log in via API and write .auth/ (session + api key)
npm run test:setup

# 5. Verify static checks
npm run check
```

| Variable           | Required | Default                   | Purpose               |
| ------------------ | -------- | ------------------------- | --------------------- |
| `QACLOUD_BASE_URL` | no       | `https://www.qacloud.dev` | Target environment    |
| `QACLOUD_USERNAME` | yes      | –                         | Test account username |
| `QACLOUD_PASSWORD` | yes      | –                         | Test account password |

`.env` and `.auth/` are gitignored, so never commit them. The test account is shared by every test, so tests create and clean up their own data and never call `/api/reset`, except in the serial `@maintenance` test.

## Running tests

| Command                         | What it runs                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `npm test`                      | Everything (setup → api + stateful + e2e-chromium)                              |
| `npm run test:setup`            | Only the auth setup project                                                     |
| `npm run test:repeat -- <spec>` | Flakiness check: `--repeat-each=3`, without the `@login` tests                  |
| `npm run test:login`            | The `@login` tests (they spend rate-limited logins): run once                   |
| `npm run test:api`              | API specs (`tests/api/**/*.api.spec.ts`): projects `api` and `stateful`         |
| `npm run test:e2e`              | E2E specs (`tests/e2e/**/*.spec.ts`) in Chromium: `e2e-chromium` and `stateful` |
| `npm run test:smoke`            | Tests tagged `@smoke`                                                           |
| `npm run report`                | Open the last Playwright HTML report                                            |

Useful flags: `--headed`, `--ui`, `--debug`, `--grep "<title>"`, `--repeat-each=3` (flakiness check; use `test:repeat`, which leaves out `@login`), `--no-deps` (skip the setup project; setup already reuses a valid `.auth/` session).

Tags: `@api`, `@e2e`, `@smoke`, `@regression`, `@maintenance`, `@stateful` (uses the account-wide basket, so it runs in the single-worker `stateful` project, API and E2E alike).

`POST /api/login` is rate-limited to 10 requests per 15 minutes per IP. Setup reuses the saved `.auth/` session while it is still valid and logs in only when it has expired, so a run spends the 4 logins in the `@login` tests (2 API, 2 E2E), plus 1 when the session needs renewing. Repeat runs leave them out (`npm run test:repeat`); run them once with `npm run test:login`.

## Code quality

| Command                | Checks                                                  |
| ---------------------- | ------------------------------------------------------- |
| `npm run typecheck`    | TypeScript strict (`tsc --noEmit`)                      |
| `npm run lint`         | ESLint: type-checked TS, Playwright rules, import order |
| `npm run format:check` | Prettier                                                |
| `npm run lint:md`      | markdownlint                                            |
| `npm run check`        | All of the above (what CI runs)                         |

Git hooks run automatically:

- **pre-commit:** ESLint `--fix` and Prettier on staged files (lint-staged).
- **commit-msg:** commitlint, which allows only **one-line** Conventional Commits, e.g. `feat(m2): add data seeder` (max 72 characters, no body).

## Project structure

```text
src/
  config/       env.ts (typed env vars), constants.ts (timeouts, routes, endpoints, tags, enums, test-data bounds)
  api/          ApiClient base, one client per resource (Auth, Products, Basket, Orders, Maintenance), types.ts
  pages/        BasePage, LoginPage, MarketPage, components/ (grid, filters, modals, basket, orders), dialogs + network wait helpers
  utils/        allure.ts (labels helper, @step decorator), assertions.ts (shared expect helpers), format.ts
  reporters/    SecretGuard.ts (fails the run if a secret reaches a report)
  data/         factories/ (faker builders), uniqueName, DataSeeder (API seeding with tracked cleanup)
  fixtures/     test.extend fixtures: apiKey, apiRequest (cookie-less), API clients, seeder, loginPage, marketPage
tests/
  setup/        auth.setup.ts: reuse valid .auth/ session or API login → .auth/
  api/          *.api.spec.ts
  e2e/          *.spec.ts
  seed.spec.ts  seed for the Playwright test agents
templates/      code scaffolds (page object, component, API client, factory, specs)
specs/          Markdown test plans
docs/           roadmap, architecture, contributing
.claude/        Claude Code agents, skills, hooks, settings
.github/        CI workflow, PR and issue templates
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the layers fit together.

## CI

GitHub Actions ([.github/workflows/playwright.yml](.github/workflows/playwright.yml)) runs on pushes and PRs to `main`:

1. **check**: `npm run check`
2. **test**: installs Chromium and runs `npx playwright test`, then uploads the HTML report as an artifact

Repository secrets required: `QACLOUD_USERNAME`, `QACLOUD_PASSWORD` (optional: `QACLOUD_BASE_URL`). Allure publishing to GitHub Pages and failure analysis arrive in M7. The repo is public, so standard GitHub-hosted runners are free.

## Claude Code tooling

This repo ships a Claude Code setup for test-automation work. See [CLAUDE.md](CLAUDE.md).

- **Agents:**
  - `sdet-test-author`, `failure-triager`, `test-reviewer`
  - Playwright's `planner`, `generator` and `healer`
- **Skills:** `/new-page-object`, `/new-api-client`, `/triage`, `/coverage-gaps`
- **Guardrails:** Claude cannot commit, push or open PRs (enforced by a hook). It lints every edited file and typechecks before finishing.

## Further documentation

| Doc                                          | Contents                                              |
| -------------------------------------------- | ----------------------------------------------------- |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Milestones, checklist, progress, defects found        |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, auth flow, data strategy, design decisions    |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Workflow, branching, commits, adding tests, standards |
| [CLAUDE.md](CLAUDE.md)                       | Standards contract for humans and Claude              |
| [templates/README.md](templates/README.md)   | Code scaffolds                                        |
| [specs/README.md](specs/README.md)           | Test plans                                            |
