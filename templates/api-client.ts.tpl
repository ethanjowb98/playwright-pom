import { ApiClient } from '@api/ApiClient';
import { type __ENTITY__, type __ENTITY__Input } from '@api/types';

/**
 * Typed client for `__PATH__`. One method per endpoint; no assertions.
 */
export class __NAME__Api extends ApiClient {
  private readonly path = '__PATH__';

  list(): Promise<__ENTITY__[]> {
    return this.get<__ENTITY__[]>(this.path);
  }

  getById(id: string): Promise<__ENTITY__> {
    return this.get<__ENTITY__>(`${this.path}/${id}`);
  }

  create(input: __ENTITY__Input): Promise<__ENTITY__> {
    return this.post<__ENTITY__>(this.path, input);
  }

  update(id: string, input: Partial<__ENTITY__Input>): Promise<__ENTITY__> {
    return this.put<__ENTITY__>(`${this.path}/${id}`, input);
  }

  remove(id: string): Promise<void> {
    return this.delete(`${this.path}/${id}`);
  }
}
