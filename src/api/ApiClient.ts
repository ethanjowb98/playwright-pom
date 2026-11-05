import { type APIRequestContext } from '@playwright/test';
import { attachment, ContentType } from 'allure-js-commons';

import { withoutCallLog } from '@api/requestErrors';
import { type ApiMessage, type HttpMethod } from '@api/types';
import { step } from '@utils/allure';

export type QueryParams = Record<string, string | number | boolean | undefined>;

const SECRET_KEYS = new Set(['password', 'api_key', 'apiKey', 'Authorization']);

/** Serialises a request/response body for Allure, masking credentials. */
function redact(value: unknown): string {
  return JSON.stringify(value, (key, v: unknown) => (SECRET_KEYS.has(key) ? '***' : v), 2);
}

/** Thrown for any non-2xx response, so negative tests can assert `rejects.toMatchObject({ status: 404 })`. */
export class ApiError extends Error {
  constructor(
    readonly method: HttpMethod,
    readonly path: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${method} ${path} returned ${status}: ${redact(body)}`);
    this.name = 'ApiError';
  }
}

/**
 * Base for every resource client: adds the `Authorization` header, sends/parses JSON,
 * throws `ApiError` on non-2xx, and wraps each call in an Allure step with request/response attachments.
 * Clients never assert.
 */
export abstract class ApiClient {
  /** @param apiKey `null` sends no `Authorization` header (session-cookie endpoints and 401 tests). */
  constructor(
    protected readonly request: APIRequestContext,
    private readonly apiKey: string | null,
  ) {}

  protected get<T>(path: string, params?: QueryParams): Promise<T> {
    return this.send('GET', path, { params }) as Promise<T>;
  }

  protected post<T>(path: string, data?: unknown): Promise<T> {
    return this.send('POST', path, { data }) as Promise<T>;
  }

  protected put<T>(path: string, data?: unknown): Promise<T> {
    return this.send('PUT', path, { data }) as Promise<T>;
  }

  protected delete<T = ApiMessage>(path: string): Promise<T> {
    return this.send('DELETE', path, {}) as Promise<T>;
  }

  /**
   * Returns the parsed JSON body; the typed wrappers above narrow it (JSON boundary). Throws `ApiError`
   * after the step has completed, so an expected 4xx in a passing negative test is not a failed step.
   */
  private async send(
    method: HttpMethod,
    path: string,
    options: { data?: unknown; params?: QueryParams },
  ): Promise<unknown> {
    const { status, ok, body } = await this.exchange(method, path, options);
    if (!ok) throw new ApiError(method, path, status, body);
    return body;
  }

  /** One HTTP round trip as an Allure step, with masked request and response attachments. */
  @step((method: HttpMethod, path: string) => `${method} ${path}`)
  private async exchange(
    method: HttpMethod,
    path: string,
    { data, params }: { data?: unknown; params?: QueryParams },
  ): Promise<{ status: number; ok: boolean; body: unknown }> {
    const query = params && definedParams(params);
    await attachment('request', redact({ method, path, query, body: data }), ContentType.JSON);

    const response = await withoutCallLog(
      this.request.fetch(path, {
        method,
        headers: this.apiKey === null ? {} : { Authorization: this.apiKey },
        data,
        params: query,
        failOnStatusCode: false,
      }),
    );
    const body = parseBody(await response.text());
    await attachment(`response ${response.status()}`, redact(body), ContentType.JSON);
    return { status: response.status(), ok: response.ok(), body };
  }
}

function definedParams(params: QueryParams): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
    ),
  );
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
