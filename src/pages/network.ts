import { type Page, type Response } from '@playwright/test';

import { type HttpMethod } from '@api/types';

/**
 * Runs a UI action and waits for the API call it triggers. `path` matches the endpoint exactly or any
 * sub-path (`/api/basket` also matches `/api/basket/<id>`). Listening starts before the action, so a
 * fast response is never missed. A non-2xx response throws here, naming the request, instead of
 * surfacing later as an unrelated wait timeout.
 */
export async function whileAwaitingApi(
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
  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    const { pathname } = new URL(response.url());
    throw new Error(
      `${response.request().method()} ${pathname} returned ${response.status()}: ${body.slice(0, 500)}`,
    );
  }
  return response;
}
