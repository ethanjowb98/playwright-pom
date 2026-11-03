import { ApiClient } from '@api/ApiClient';
import { type LoginResponse, type Profile } from '@api/types';
import { ENDPOINTS } from '@config/constants';

/**
 * Session endpoints. They authenticate by cookie, not api key, so this client sends no `Authorization` header.
 * A successful `login` stores the session cookie on the request context used by `profile`.
 */
export class AuthApi extends ApiClient {
  login(username: string, password: string): Promise<LoginResponse> {
    return this.post<LoginResponse>(ENDPOINTS.login, { username, password });
  }

  profile(): Promise<Profile> {
    return this.get<Profile>(ENDPOINTS.profile);
  }
}
