# Code templates

Scaffolds used by the `/new-page-object` and `/new-api-client` Claude skills, and by humans, so every file has the same shape.

| Template             | Creates                                 | Placeholders                          |
| -------------------- | --------------------------------------- | ------------------------------------- |
| `page-object.ts.tpl` | `src/pages/__NAME__Page.ts`             | `__NAME__`, `__ROUTE__`               |
| `component.ts.tpl`   | `src/pages/components/__NAME__.ts`      | `__NAME__`, `__ROOT_SELECTOR__`       |
| `api-client.ts.tpl`  | `src/api/__NAME__Api.ts`                | `__NAME__`, `__ENTITY__`, `__PATH__`  |
| `factory.ts.tpl`     | `src/data/factories/__name__Factory.ts` | `__NAME__`, `__name__`, `__ENTITY__`  |
| `api.spec.ts.tpl`    | `tests/api/__name__.api.spec.ts`        | `__NAME__`, `__name__`, `__FEATURE__` |
| `e2e.spec.ts.tpl`    | `tests/e2e/__name__.spec.ts`            | `__NAME__`, `__name__`, `__FEATURE__` |

Templates reference modules from later milestones (`ApiClient` M2, fixtures M2/M4, Allure helpers M5) and are not compiled. Replace every placeholder, then run `npm run check`.
