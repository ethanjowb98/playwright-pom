# playwright-pom

Playwright + TypeScript test automation for the [qacloud.dev Market](https://www.qacloud.dev/market.html) app, built on the Page Object Model. It covers the **API** and **E2E (UI)** layers and generates its test data through the API. Results are reported with Allure, and a rule-based analysis groups failures by shared root cause.

> Milestones, progress and the product defects the suite has found: [docs/ROADMAP.md](docs/ROADMAP.md).

## Contents

- [Requirements](#requirements)
- [Build-out (first-time setup)](#build-out-first-time-setup)
- [Running tests](#running-tests)
- [Reports](#reports)
- [Failure analysis](#failure-analysis)
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

`.env` and `.auth/` are gitignored, so never commit them. The test account is shared by every test, so tests create and clean up their own data and never call `/api/reset`, except the tests in `tests/maintenance`, which run only via `npm run test:maintenance`.

## Running tests

| Command                         | What it runs                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm test`                      | Everything except `tests/maintenance` (setup → api + stateful + e2e-chromium)              |
| `npm run test:setup`            | Only the auth setup project                                                                |
| `npm run test:repeat -- <spec>` | Flakiness check: `--repeat-each=3`, without the `@login` tests                             |
| `npm run test:login`            | The `@login` tests (they spend rate-limited logins): run once                              |
| `npm run test:maintenance`      | `tests/maintenance`: `POST /api/reset` **wipes the whole account**; run alone, never in CI |
| `npm run test:api`              | API specs (`tests/api/**/*.api.spec.ts`): projects `api` and `stateful`                    |
| `npm run test:e2e`              | E2E specs (`tests/e2e/**/*.spec.ts`) in Chromium: `e2e-chromium` and `stateful`            |
| `npm run test:smoke`            | Tests tagged `@smoke`                                                                      |

Useful flags: `--headed`, `--ui`, `--debug`, `--grep "<title>"`, `--repeat-each=3` (flakiness check; use `test:repeat`, which leaves out `@login`), `--no-deps` (skip the setup project; setup already reuses a valid `.auth/` session).

Tags: `@api`, `@e2e`, `@smoke`, `@regression`, `@login` (spends a rate-limited login), `@maintenance` (resets the account), `@stateful` (uses the account-wide basket, so it runs in the single-worker `stateful` project, API and E2E alike).

`POST /api/login` is rate-limited to 10 requests per 15 minutes per IP. Setup reuses the saved `.auth/` session while it is still valid and logs in only when it has expired, so a run spends the 4 logins in the `@login` tests (2 API, 2 E2E), plus 1 when the session needs renewing. Repeat runs leave them out (`npm run test:repeat`); run them once with `npm run test:login`. CI runs them in the nightly run only (see [CI](#ci)).

## Reports

| Command                   | What it does                                                                  |
| ------------------------- | ----------------------------------------------------------------------------- |
| `npm run report`          | Open the last Playwright HTML report                                          |
| `npm run allure:generate` | Build the Allure report from `allure-results/` into `allure-report/`          |
| `npm run allure:open`     | Serve `allure-report/` and open it in the browser (generates it when missing) |

Every run clears `allure-results/` first, so the report shows the last run only, like the HTML report. Listing tests (`--list`) writes no reports. The Allure CLI is the npm `allure` package (Allure 3), so no Java is needed. The report shows:

- a tree by epic (`Market`) → feature → story, with severity and owner labels
- a step for every page-object, API-client and seeder call, with masked request/response attachments, plus screenshots and videos of failures
- failure categories: Known product defect, Auth, API 5xx, API 4xx, Test defect, Locator not found, Timeout; anything else lands in Allure's built-in Product errors (usually an assertion mismatch)
- the environment (base URL, Playwright, browsers, projects, workers, Node, OS) and the executor (local, or the GitHub Actions run)
- trends over the last 20 runs, from `allure-history.jsonl`, which every `allure:generate` appends to (in CI it lives on GitHub Pages)

## Failure analysis

After a red run, `npm run analyze` groups the failures by shared root cause (rule-based: no LLM, no network) and writes `failure-analysis.md` and `failure-analysis.json`. `npm run analyze -- --results <dir>` reads another results folder.

- Each cluster names its cause (the locator, the `METHOD path → status`, or the normalised error), the category, the source line most likely responsible, the failing step, and its tests, largest cluster first. Two or more tests in one cluster are flagged as a likely shared root cause.
- Tests that passed on retry are listed as flaky, and `test.fixme` product defects as known defects.
- Each cluster is marked **new** or **recurring** against the previous analysis, and clusters that stopped failing are listed as resolved.
- `/triage` runs the tests, this analysis and the `failure-triager` agent in one go.

## Code quality

| Command                | Checks                                                  |
| ---------------------- | ------------------------------------------------------- |
| `npm run typecheck`    | TypeScript strict (`tsc --noEmit`)                      |
| `npm run lint`         | ESLint: type-checked TS, Playwright rules, import order |
| `npm run format:check` | Prettier                                                |
| `npm run lint:md`      | markdownlint                                            |
| `npm run test:unit`    | Unit tests for `scripts/` (`node:test`)                 |
| `npm run check`        | All of the above (what CI runs)                         |

Git hooks run automatically:

- **pre-commit:** ESLint `--fix` and Prettier on staged files (lint-staged).
- **commit-msg:** commitlint, which allows only **one-line** Conventional Commits, e.g. `feat(m2): add data seeder` (max 72 characters, no body).

## Project structure

```text
src/
  config/       env.ts (typed env vars), constants.ts (timeouts, routes, endpoints, tags, enums, test-data bounds),
                allureCategories.ts (Allure failure categories)
  api/          ApiClient base, one client per resource (Auth, Products, Basket, Orders, Maintenance), types.ts
  pages/        BasePage, LoginPage, MarketPage, components/ (grid, filters, modals, basket, orders), dialog, form-validation and network wait helpers
  utils/        allure.ts (labels, productDefect, @step decorator), assertions.ts (shared expect helpers), format.ts,
                secrets.ts (reads and masks the password and api key)
  reporters/    AllureRunInfo.ts (clears allure-results, writes environment + executor),
                SecretGuard.ts (keeps a report that shows a secret out of CI)
  data/         factories/ (faker builders), uniqueName, DataSeeder (API seeding with tracked cleanup)
  fixtures/     test.extend fixtures: apiKey, apiRequest (cookie-less), API clients, seeder, loginPage, marketPage
tests/
  setup/        auth.setup.ts: reuse valid .auth/ session or API login → .auth/
  api/          *.api.spec.ts
  e2e/          *.spec.ts
  maintenance/  *.maintenance.spec.ts (POST /api/reset): only via npm run test:maintenance
  seed.spec.ts  seed for the Playwright test agents
scripts/        analyze-failures.ts (npm run analyze) + failure-analysis/ (load, signals, source lookup, clustering, report),
                report-site.ts + report-site/ (CI: the GitHub Pages report site); all unit-tested
templates/      code scaffolds (page object, component, API client, factory, specs)
specs/          Markdown test plans
allurerc.ts     Allure 3 report config (tree grouping, categories)
docs/           roadmap, architecture, contributing
.claude/        Claude Code agents, skills, hooks, settings
.github/        CI workflow + composite actions (setup, run-tests, report), PR and issue templates
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the layers fit together.

## CI

GitHub Actions ([.github/workflows/playwright.yml](.github/workflows/playwright.yml)) runs on pushes and PRs to `main`, nightly at 03:00 UTC, and on demand (**Run workflow**, with a `suite` of all, api, e2e or smoke):

1. **check**: actionlint and `npm run check`
2. **api**, **e2e** (2 shards) and **stateful** (basket and order tests, one at a time across runs) in parallel, each uploading its Allure results. The `@login` tests run in the nightly run only, to stay inside the login rate limit. Pull requests from forks and Dependabot skip the tests: they get no repository secrets.
3. **report** or **publish**: merges the results, runs `npm run analyze`, generates the Allure report with the history of earlier runs, and writes the analysis to the job summary (and, on a PR, one sticky comment)

Every run except pull requests (pushes to `main`, the nightly, and manual runs of any branch or suite) **publishes** the report to GitHub Pages, failing and skipped tests included: the run list at `https://<owner>.github.io/<repo>/` (with each run's branch, suite and results), the newest report at `latest/`, and the last 20 reports with their trends. Pull requests keep the report as the run's `allure-report` artifact.

Repository setup:

- Secrets: `QACLOUD_USERNAME`, `QACLOUD_PASSWORD` (optional: `QACLOUD_BASE_URL`). The username shows in the published reports; only the password and api key are kept out.
- Pages: after the first published run (a push to `main`, or a manual run) has created the `gh-pages` branch, set **Settings → Pages → Deploy from a branch → `gh-pages` / `(root)`**. For a custom domain, set the repository variable `REPORT_SITE_URL`.

The repo is public, so standard GitHub-hosted runners are free. Details: [docs/ARCHITECTURE.md#ci](docs/ARCHITECTURE.md#ci).

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
