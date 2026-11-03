import { faker } from '@faker-js/faker';

import { type __ENTITY__Input } from '@api/types';
import { uniqueName } from '@data/uniqueName';

/** Builds a valid __ENTITY__ payload; pass overrides for the fields a test cares about. */
export function build__NAME__(overrides: Partial<__ENTITY__Input> = {}): __ENTITY__Input {
  return {
    name: uniqueName('__name__'),
    description: faker.commerce.productDescription(),
    ...overrides,
  };
}
