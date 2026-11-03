import { ApiClient } from '@api/ApiClient';
import { type ResetResult } from '@api/types';
import { ENDPOINTS } from '@config/constants';

/** Account-wide maintenance. `reset` wipes every product, basket item and order: serial `@maintenance` tests only. */
export class MaintenanceApi extends ApiClient {
  reset(): Promise<ResetResult> {
    return this.post<ResetResult>(ENDPOINTS.reset);
  }
}
