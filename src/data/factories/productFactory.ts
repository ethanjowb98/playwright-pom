import { faker } from '@faker-js/faker';

import { type ProductInput } from '@api/types';
import { PRODUCT_CATEGORIES, TEST_DATA } from '@config/constants';
import { uniqueName } from '@data/uniqueName';

/** Builds a valid product payload; pass overrides for the fields a test cares about. */
export function buildProduct(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    product_name: uniqueName(faker.commerce.productName()),
    category: faker.helpers.arrayElement(PRODUCT_CATEGORIES),
    price: faker.number.float({ ...TEST_DATA.price, fractionDigits: 2 }),
    stock: faker.number.int(TEST_DATA.stock),
    details: { brand: faker.company.name(), origin: faker.location.country() },
    ...overrides,
  };
}
