import { type Page, type Response } from '@playwright/test';

import { type HttpMethod } from '@api/types';

/**
 * Runs a UI action and returns the response of the API call it triggers, whatever its status. `path`
 * matches the endpoint exactly or any sub-path (`/api/basket` also matches `/api/basket/<id>`).
 * Listening starts before the action, so a fast response is never missed. For negative tests that
 * expect the API to reject the request; everything else uses `whileAwaitingApi`.
 */
export async function awaitApiResponse(
  page: Page,
  methods: HttpMethod | readonly HttpMethod[],
  path: string,
  action: () => Promise<unknown>,
): Promise<Response> {
  const accepted: readonly string[] = typeof methods === 'string' ? [methods] : methods;
  const [response] = await Promise.all([
    page.waitForResponse((res) => {
      const { pathname } = new URL(res.url());
      return (
        accepted.includes(res.request().method()) &&
        (pathname === path || pathname.startsWith(`${path}/`))
      );
    }),
    action(),
  ]);
  return response;
}

/**
 * `awaitApiResponse` for actions that must succeed: a non-2xx response throws here, naming the request,
 * instead of surfacing later as an unrelated wait timeout.
 */
export async function whileAwaitingApi(
  page: Page,
  methods: HttpMethod | readonly HttpMethod[],
  path: string,
  action: () => Promise<unknown>,
): Promise<Response> {
  const response = await awaitApiResponse(page, methods, path, action);
  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    const { pathname } = new URL(response.url());
    throw new Error(
      `${response.request().method()} ${pathname} returned ${response.status()}: ${body.slice(0, 500)}`,
    );
  }
  return response;
}
