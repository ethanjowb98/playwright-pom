# Test plans

Markdown test plans for the Market app. The `playwright-test-planner` agent writes them, and humans can too. The `playwright-test-generator` agent then turns them into specs.

- Start every plan from [`_template.md`](_template.md).
- One file per feature area, e.g. `market-checkout.md`.
- The seed for generated tests is `tests/seed.spec.ts` (an authenticated Market page).
