import { faker } from '@faker-js/faker';

import { TEST_DATA } from '@config/constants';

/**
 * `QA-<worker>-<id> <label>`: unique per worker and call, so parallel workers never collide on the shared account,
 * and every record the suite creates is recognisable by its `QA-` prefix.
 */
export function uniqueName(label: string): string {
  const worker = process.env.TEST_WORKER_INDEX ?? 'x';
  const id = faker.string.alphanumeric({ length: TEST_DATA.idLength, casing: 'lower' });
  return `${TEST_DATA.namePrefix}-${worker}-${id} ${label}`;
}
