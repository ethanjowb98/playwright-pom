# Code templates

Scaffolds used by the `/new-page-object` and `/new-api-client` Claude skills, and by humans, so every file has the same shape.

| Template             | Creates                                 | Placeholders                                               |
| -------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `page-object.ts.tpl` | `src/pages/__NAME__Page.ts`             | `__NAME__`, `__ROUTE__`, `__ROUTE_KEY__` (key in `ROUTES`) |
| `component.ts.tpl`   | `src/pages/components/__NAME__.ts`      | `__NAME__`, `__ROOT_SELECTOR__`, `__API_PATH__`            |
| `api-client.ts.tpl`  | `src/api/__NAME__Api.ts`                | `__NAME__`, `__ENTITY__`, `__PATH__`                       |
| `factory.ts.tpl`     | `src/data/factories/__name__Factory.ts` | `__NAME__`, `__name__`, `__ENTITY__`                       |
| `api.spec.ts.tpl`    | `tests/api/__name__.api.spec.ts`        | `__NAME__`, `__name__`, `__FEATURE__`                      |
| `e2e.spec.ts.tpl`    | `tests/e2e/__name__.spec.ts`            | `__NAME__`, `__name__`, `__FEATURE__`                      |

Templates are not compiled. Page objects and components wrap intents in the `@step` decorator from `@utils/allure`; specs set Allure labels with `labels()`. Replace every placeholder, then run `npm run check`.
