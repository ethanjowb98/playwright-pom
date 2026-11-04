---
name: triage
description: Run the suite (or a subset), cluster failures with the rule-based analyzer, then have the failure-triager agent explain the shared root causes. Usage /triage [api|e2e|smoke|<path>]
---

1. Run the tests and allow failures:
   - with no argument: `npm test`
   - `api` / `e2e` / `smoke`: `npm run test:<arg>`
   - a path: `npx playwright test <path>`

   Every run clears `allure-results/` itself, so the analysis only covers this run. A full run spends 4 rate-limited logins (the `@login` tests; 10 per 15 min), so when re-running to confirm a fix, add `--grep-invert @login` unless the fix is in login code.

2. Run `npm run analyze`, which writes `failure-analysis.md` and `failure-analysis.json`.
3. If everything passed, say so and stop. If `SecretGuard` failed the run (`secret-guard-leak.txt` exists), report it first as a blocker with the locations from that file, and tell the user to delete `playwright-report/`, `allure-results/` and `test-results/`; never print the secret.
4. Otherwise, delegate to the `failure-triager` agent with the run's paths. Return its report verbatim, in the fixed format.
5. Offer next steps, without doing them unprompted:
   - fix the test defects
   - draft a bug report from `.github/ISSUE_TEMPLATE/bug_report.yml` for each product defect
   - mark product defects with `test.fixme(title, { tag, annotation: productDefect('<Feature>', '<reason>') }, body)`

Never commit.
