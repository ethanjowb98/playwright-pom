# Contributing

## Workflow

1. Branch from an up-to-date `main`: `feat/m<N>-<slug>` for milestone work, or `feat|fix|test|chore/<slug>` otherwise.
2. Make the change, following [CLAUDE.md](../CLAUDE.md) (it applies to humans too).
3. Verify:

   ```bash
   npm run check
   npm run test:repeat -- <changed spec>                     # --repeat-each=3 without @login; add --workers=4 for e2e
   npm run test:login                                        # only if you touched login: runs the @login tests once
   ```

4. Update [docs/ROADMAP.md](ROADMAP.md), plus the README and docs if you added a command, folder or convention.
5. Commit with a **one-line** Conventional Commit. commitlint rejects anything else:

   ```text
   <type>(<scope>): <summary>      # max 72 chars, no body
   feat(m2): add orders api client
   fix(e2e): stabilise basket count assertion
   ```

   Types: `feat`, `fix`, `test`, `refactor`, `docs`, `build`, `ci`, `chore`, `perf`, `style`, `revert`.

6. Open a PR titled `[M<N>] <title>` (or a plain title outside milestones) and fill in the PR template. One milestone per PR.

## Adding tests

| You need            | Start from                                         | Or ask Claude                   |
| ------------------- | -------------------------------------------------- | ------------------------------- |
| API coverage        | `templates/api-client.ts.tpl`, `api.spec.ts.tpl`   | `/new-api-client <resource>`    |
| New page or widget  | `templates/page-object.ts.tpl`, `component.ts.tpl` | `/new-page-object <Name>`       |
| E2E scenario        | `templates/e2e.spec.ts.tpl`                        | `sdet-test-author` agent        |
| Test plan           | `specs/_template.md`                               | `playwright-test-planner` agent |
| Find untested areas | CRUD matrix in CLAUDE.md                           | `/coverage-gaps`                |

Checklist for every test:

- [ ] Title: `should <behaviour> when <condition>`
- [ ] Tags: `@api`/`@e2e` + `@smoke`/`@regression`
- [ ] Allure: epic `Market`, feature, story, severity, owner (via `labels()` from `@utils/allure`)
- [ ] Data seeded via API and cleaned up; unique names from factories
- [ ] Touches the basket or places an order → tagged `@stateful` (see [ARCHITECTURE](ARCHITECTURE.md#isolation-the-basket-is-account-wide))
- [ ] No raw locators or HTTP calls in the spec; no hard waits
- [ ] E2E: page-object intents are `@step`-decorated and wait for the API call they trigger; cards and rows are found by unique name, never by index
- [ ] Iterating locally: setup reuses a valid `.auth/` session, so only the login tests spend the budget (10 per 15 min)
- [ ] No credential in a `@step` title, `fill` or `pressSequentially` (`SecretGuard` fails the run)
- [ ] Passes `npm run test:repeat` (`@login` tests once via `npm run test:login`)

## When a test fails

1. Run `/triage`, or `npm run analyze` (M6), and look at the **largest cluster** first.
2. Classify the cause: product defect, test defect, flaky, or environment.
3. Product defect: keep the correct assertion, mark the test `test.fixme(title, { tag, annotation: productDefect('<Feature>', '<what the app does wrong>') }, body)`, open a **Product defect** issue, and log it in ROADMAP.
4. Flaky test: open a **Flaky test** issue and fix the root cause. Never add sleeps or extra retries.

## Code style

Prettier and ESLint handle the formatting. Run `npm run lint:fix && npm run format`, or rely on the pre-commit hook. VS Code users: install the recommended extensions (`.vscode/extensions.json`) for format-on-save and ESLint fix-on-save.
