---
name: new-page-object
description: Scaffold a new page object or UI component for the Market suite from templates/, wire it into the fixtures, and add a minimal E2E spec skeleton. Usage /new-page-object <Name> [component]
---

Scaffold a page object (or a component when the second argument is `component`) named `$ARGUMENTS`.

1. Check `src/pages/` and `src/pages/components/` for an existing class covering the same page or widget. If one exists, stop and propose extending it instead.
2. Copy `templates/page-object.ts.tpl` (or `templates/component.ts.tpl`) to `src/pages/<Name>Page.ts` (or `src/pages/components/<Name>.ts`) and replace the `__NAME__` placeholders.
3. Use the live app to choose locators:
   - Use the Playwright MCP / `playwright-test-planner` snapshot, or read the page source.
   - Priority: `getByRole` → `getByLabel` → stable `#id` → CSS. Declare them as `readonly` fields in the constructor.
4. Add intent-named async methods that return `this` or the next page object. No assertions, except `expect`-based waits.
   - Decorate each with `@step` from `@utils/allure`, with a title naming the target: ``@step((name: string) => `Edit "${name}"`)``. Never build a title from a credential.
   - Wait for the API call the intent triggers with `whileAwaitingApi` (`@pages/network`). Answer native dialogs with `answerDialog` (`@pages/dialogs`).
   - An intent that creates a record returns it from the response, so specs can track it for cleanup on the same line.
   - Never type a credential with `fill` / `pressSequentially`; set it with `locator.evaluate()` (see `LoginPage`).
5. Register a fixture in `src/fixtures/index.ts`, or compose the component into its parent page.
6. Create `tests/e2e/<name>.spec.ts` from `templates/e2e.spec.ts.tpl` with one `@smoke` test.
7. Run `npm run typecheck`, `npm run lint` and the new spec with `npm run test:repeat -- <spec>`. Report the results, and don't commit.
