---
name: coverage-gaps
description: Compare the CRUD coverage matrix, ACID invariants and Market API docs against existing specs and list what is untested. Usage /coverage-gaps
---

1. Build the expected inventory from the following sources:
   - the "CRUD coverage matrix" and "ACID" sections of `CLAUDE.md`
   - every endpoint and method in https://www.qacloud.dev/market/docs and in `src/api/*Api.ts`
   - the UI features in `src/pages/**`
2. Build the actual inventory:
   - Run `npx playwright test --list --reporter=json` to get every test title, file and tag.
   - Grep the specs for API client method calls and page-object method calls.
3. Output one table per resource (Product, Basket, Order, Auth) with the columns Behaviour | API covered | UI covered | Negative cases | ACID invariant | Test(s). Use ✅ / ❌ / ➖ (not applicable).
4. List the top 10 gaps ranked by risk, with a proposed test title (`should … when …`) and a target file for each.
5. Don't write tests unless asked. Offer to hand the list to the `sdet-test-author` agent.
