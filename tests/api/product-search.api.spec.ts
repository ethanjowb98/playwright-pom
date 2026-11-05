import { type FilteredProduct, type ProductFilter, type ProductInput } from '@api/types';
import { TAGS } from '@config/constants';
import { SORT_CASES } from '@data/sortCases';
import { uniqueName } from '@data/uniqueName';
import { expect, test } from '@fixtures';
import { labels, productDefect, Severity } from '@utils/allure';

/** Each case seeds a matching target and a decoy that differs only in the filtered field(s). */
const filterCases: {
  name: string;
  filter: ProductFilter;
  target: Partial<ProductInput>;
  decoy: Partial<ProductInput>;
}[] = [
  {
    name: 'category',
    filter: { category: 'snacks' },
    target: { category: 'snacks' },
    decoy: { category: 'bakery' },
  },
  {
    name: 'temperature zone Dry',
    filter: { temperature_zone: 'Dry' },
    target: { temperature_zone: 'Dry' },
    decoy: { temperature_zone: 'Chilled' },
  },
  {
    name: 'temperature zone Frozen',
    filter: { temperature_zone: 'Frozen' },
    target: { temperature_zone: 'Frozen' },
    decoy: { temperature_zone: 'Room Temperature' },
  },
  {
    name: 'temperature zone Chilled',
    filter: { temperature_zone: 'Chilled' },
    target: { temperature_zone: 'Chilled' },
    decoy: { temperature_zone: 'Dry' },
  },
  {
    name: 'temperature zone Room Temperature',
    filter: { temperature_zone: 'Room Temperature' },
    target: { temperature_zone: 'Room Temperature' },
    decoy: { temperature_zone: 'Frozen' },
  },
  {
    name: 'weighted',
    filter: { weighted: true },
    target: { weighted: true },
    decoy: { weighted: false },
  },
  {
    name: 'sold each',
    filter: { weighted: false },
    target: { weighted: false },
    decoy: { weighted: true },
  },
  {
    name: 'category, zone and weighted combined',
    filter: { category: 'frozen', temperature_zone: 'Frozen', weighted: true },
    target: { category: 'frozen', temperature_zone: 'Frozen', weighted: true },
    decoy: { category: 'frozen', temperature_zone: 'Frozen', weighted: false },
  },
];

const invalidFilters: { condition: string; params: Record<string, string> }[] = [
  { condition: 'the temperature zone is unknown', params: { temperature_zone: 'Hot' } },
  { condition: 'weighted is not true or false', params: { weighted: 'maybe' } },
];

function rowsNotMatching(rows: FilteredProduct[], filter: ProductFilter): FilteredProduct[] {
  return rows.filter((row) =>
    Object.entries(filter).some(([key, value]) => row[key as keyof ProductFilter] !== value),
  );
}

test.describe('Product search API', { tag: [TAGS.api] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Product search' });
  });

  for (const { sort, expected } of SORT_CASES) {
    test(
      `should list products in ${sort} name order when sort is ${sort}`,
      { tag: [TAGS.regression] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Sort', severity: Severity.NORMAL });
        // Arrange
        const token = await seeder.seedSortSet(uniqueName('sort'));

        // Act
        const listed = (await productsApi.list(sort))
          .map(({ product_name }) => product_name)
          .filter((name) => name.startsWith(token));

        // Assert
        expect(listed).toEqual(expected.map((suffix) => `${token} ${suffix}`));
      },
    );
  }

  for (const { name, filter, target, decoy } of filterCases) {
    test(
      `should return only matching products when filtering by ${name}`,
      { tag: [TAGS.regression] },
      async ({ seeder, productsApi }) => {
        await labels({ story: 'Filter', severity: Severity.NORMAL });
        const [match, nonMatch] = await Promise.all([
          seeder.seedProduct(target),
          seeder.seedProduct(decoy),
        ]);

        const rows = await productsApi.filter(filter);

        const ids = rows.map(({ id }) => id);
        expect(ids).toContain(match.id);
        expect(ids).not.toContain(nonMatch.id);
        expect(rowsNotMatching(rows, filter)).toEqual([]);
      },
    );
  }

  test(
    'should return products of every listed category when several categories are filtered',
    { tag: [TAGS.regression] },
    async ({ seeder, productsApi }) => {
      await labels({ story: 'Filter', severity: Severity.NORMAL });
      const [snack, bread, decoy] = await Promise.all([
        seeder.seedProduct({ category: 'snacks' }),
        seeder.seedProduct({ category: 'bakery' }),
        seeder.seedProduct({ category: 'household' }),
      ]);

      // Documented: one or more categories, comma-separated
      const rows = await productsApi.filter({ category: 'snacks,bakery' });

      const ids = rows.map(({ id }) => id);
      expect(ids).toEqual(expect.arrayContaining([snack.id, bread.id]));
      expect(ids).not.toContain(decoy.id);
      expect(rows.filter(({ category }) => !['snacks', 'bakery'].includes(category))).toEqual([]);
    },
  );

  for (const { condition, params } of invalidFilters) {
    test(
      `should reject the filter with 400 when ${condition}`,
      { tag: [TAGS.regression] },
      async ({ productsApi }) => {
        await labels({ story: 'Filter validation', severity: Severity.NORMAL });

        await expect(productsApi.filterRaw(params)).rejects.toMatchObject({ status: 400 });
      },
    );
  }

  test.fixme(
    'should return the same product fields as the catalogue when filtering',
    {
      tag: [TAGS.regression],
      annotation: productDefect(
        'Product search',
        '/api/products/filter rows use `name` instead of `product_name`',
      ),
    },
    async ({ seeder, productsApi }) => {
      await labels({ story: 'Filter', severity: Severity.MINOR });
      const product = await seeder.seedProduct({ category: 'household' });

      const rows = await productsApi.filter({ category: 'household' });

      expect(rows.find(({ id }) => id === product.id)).toEqual(product);
    },
  );
});
