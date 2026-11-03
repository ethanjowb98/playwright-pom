---
name: new-api-client
description: Scaffold a typed API client, data factory and CRUD spec skeleton for a Market API resource from templates/. Usage /new-api-client <resource> (e.g. orders)
---

Scaffold API test support for the resource `$ARGUMENTS`.

1. Look up the resource's endpoints and payloads:
   - Check `CLAUDE.md` → "Target app" and <https://www.qacloud.dev/market/docs>.
   - Remember that the UI calls `/api/products`, while the docs say `/api/groceries`. **Trust what the UI calls.**
2. Add request/response interfaces to `src/api/types.ts`.
3. Create `src/api/<Resource>Api.ts` from `templates/api-client.ts.tpl`. It extends `ApiClient`, with one typed method per endpoint and no assertions.
4. Create `src/data/factories/<resource>Factory.ts` from `templates/factory.ts.tpl` (faker + `overrides`, with unique names).
5. Register the client in `src/fixtures/index.ts` on the cookie-less `apiRequest` fixture (never the built-in `request`). If the resource is something tests need to create, add `seed<Resource>()` to `DataSeeder` with cleanup tracking, decorated with `@step`. `ApiClient` already wraps every call in a step and attaches the masked request and response.
6. Create `tests/api/<resource>.api.spec.ts` from `templates/api.spec.ts.tpl`. It should cover every CRUD cell, plus the 400, 401 and 404 negatives and one durability re-read.
7. Run `npm run typecheck`, `npm run lint` and `npm run test:repeat -- tests/api/<resource>.api.spec.ts`. Report the results, and don't commit.
