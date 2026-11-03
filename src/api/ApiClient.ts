import { type APIRequestContext } from '@playwright/test';
import { attachment, ContentType, step } from 'allure-js-commons';

import { type ApiMessage } from '@api/types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
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
    super(`${method} ${path} returned ${status}: ${JSON.stringify(body)}`);
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
    return this.send<T>('GET', path, { params });
  }

  protected post<T>(path: string, data?: unknown): Promise<T> {
    return this.send<T>('POST', path, { data });
  }

  protected put<T>(path: string, data?: unknown): Promise<T> {
    return this.send<T>('PUT', path, { data });
  }

  protected delete<T = ApiMessage>(path: string): Promise<T> {
    return this.send<T>('DELETE', path, {});
  }

  private async send<T>(
    method: HttpMethod,
    path: string,
    { data, params }: { data?: unknown; params?: QueryParams },
  ): Promise<T> {
    const query = params && definedParams(params);
    return step(`${method} ${path}`, async () => {
      await attachment('request', redact({ method, path, query, body: data }), ContentType.JSON);

      const response = await this.request.fetch(path, {
        method,
        headers: this.apiKey === null ? {} : { Authorization: this.apiKey },
        data,
        params: query,
        failOnStatusCode: false,
      });
      const body = parseBody(await response.text());
      await attachment(`response ${response.status()}`, redact(body), ContentType.JSON);

      if (!response.ok()) {
        throw new ApiError(method, path, response.status(), body);
      }
      return body as T;
    });
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
