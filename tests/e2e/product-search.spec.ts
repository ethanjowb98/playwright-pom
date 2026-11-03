import { type ProductInput } from '@api/types';
import { TAGS } from '@config/constants';
import { uniqueName } from '@data/uniqueName';
import { expect, test } from '@fixtures';
import { type FilterSidebar } from '@pages/components/FilterSidebar';
import { labels, Severity } from '@utils/allure';

const sortCases = [
  { sort: 'asc', expected: ['Alpha', 'Bravo', 'Charlie'] },
  { sort: 'desc', expected: ['Charlie', 'Bravo', 'Alpha'] },
] as const;

/** Each case seeds a matching target and a decoy that differs only in the filtered field. */
const filterCases: {
  name: string;
  apply: (filters: FilterSidebar) => Promise<unknown>;
  target: Partial<ProductInput>;
  decoy: Partial<ProductInput>;
  summary: string;
}[] = [
  {
    name: 'category',
    apply: (filters) => filters.filterByCategory('snacks'),
    target: { category: 'snacks' },
    decoy: { category: 'bakery' },
    summary: '1 category',
  },
  {
    name: 'temperature zone',
    apply: (filters) => filters.filterByZone('Frozen'),
    target: { temperature_zone: 'Frozen' },
    decoy: { temperature_zone: 'Dry' },
    summary: 'zone: Frozen',
  },
  {
    name: 'weighted',
    apply: (filters) => filters.filterByWeighted(true),
    target: { weighted: true },
    decoy: { weighted: false },
    summary: 'weighted only',
  },
  {
    name: 'sold each',
    apply: (filters) => filters.filterByWeighted(false),
    target: { weighted: false },
    decoy: { weighted: true },
    summary: 'each only',
  },
];

test.describe('Product search UI', { tag: [TAGS.e2e] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: 'Product search' });
  });

  test(
    'should show only the matching product when searching by its name',
    { tag: [TAGS.smoke] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Search', severity: Severity.CRITICAL });
      const product = await seeder.seedProduct();
      await marketPage.open();

      await marketPage.products.searchFor(product.product_name);

      await expect(marketPage.products.titles).toHaveText([product.product_name]);
      await expect(marketPage.products.resultsCount).toHaveText('1 product shown');
    },
  );

  test(
    'should find the product when searching by a detail value',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Search', severity: Severity.NORMAL });
      const batch = uniqueName('batch');
      const product = await seeder.seedProduct({ details: { batch } });
      await marketPage.open();

      await marketPage.products.searchFor(batch);

      await expect(marketPage.products.titles).toHaveText([product.product_name]);
    },
  );

  test(
    'should show the empty state when nothing matches the search',
    { tag: [TAGS.regression] },
    async ({ marketPage }) => {
      await labels({ story: 'Search', severity: Severity.MINOR });
      await marketPage.open();

      await marketPage.products.searchFor(uniqueName('no such product'));

      await expect(marketPage.products.emptyState).toBeVisible();
      await expect(marketPage.products.resultsCount).toHaveText('0 products shown');
    },
  );

  for (const { sort, expected } of sortCases) {
    test(
      `should list products in ${sort} name order when sorted ${sort}`,
      { tag: [TAGS.regression] },
      async ({ seeder, marketPage }) => {
        await labels({ story: 'Sort', severity: Severity.NORMAL });
        // Three names sharing a unique prefix, so other workers' data cannot interleave
        const token = uniqueName('sort');
        await Promise.all(
          ['Charlie', 'Alpha', 'Bravo'].map((suffix) =>
            seeder.seedProduct({ product_name: `${token} ${suffix}` }),
          ),
        );
        await marketPage.open();

        // Sorting refetches and drops the search text, so sort first
        await marketPage.filters.sortBy(sort);
        await marketPage.products.searchFor(token);

        await expect(marketPage.products.titles).toHaveText(
          expected.map((suffix) => `${token} ${suffix}`),
        );
      },
    );
  }

  for (const { name, apply, target, decoy, summary } of filterCases) {
    test(
      `should show the match and hide the decoy when filtering by ${name}`,
      { tag: [TAGS.regression] },
      async ({ seeder, marketPage }) => {
        await labels({ story: 'Filter', severity: Severity.NORMAL });
        const [match, nonMatch] = await Promise.all([
          seeder.seedProduct(target),
          seeder.seedProduct(decoy),
        ]);
        await marketPage.open();

        await apply(marketPage.filters);

        await expect(marketPage.products.card(nonMatch.product_name)).toHaveCount(0);
        await expect(marketPage.products.card(match.product_name)).toBeVisible();
        await expect(marketPage.filters.activeSummary).toContainText(summary);
      },
    );
  }

  test(
    'should show products of every checked category when several categories are checked',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Filter', severity: Severity.NORMAL });
      const [snack, bread, decoy] = await Promise.all([
        seeder.seedProduct({ category: 'snacks' }),
        seeder.seedProduct({ category: 'bakery' }),
        seeder.seedProduct({ category: 'household' }),
      ]);
      await marketPage.open();

      await marketPage.filters.filterByCategory('snacks');
      await marketPage.filters.filterByCategory('bakery');

      await expect(marketPage.products.card(decoy.product_name)).toHaveCount(0);
      await expect(marketPage.products.card(snack.product_name)).toBeVisible();
      await expect(marketPage.products.card(bread.product_name)).toBeVisible();
    },
  );

  test(
    'should show every product again when the filters are cleared',
    { tag: [TAGS.regression] },
    async ({ seeder, marketPage }) => {
      await labels({ story: 'Filter', severity: Severity.NORMAL });
      const decoy = await seeder.seedProduct({ category: 'bakery' });
      await marketPage.open();
      await marketPage.filters.filterByCategory('snacks');
      await expect(marketPage.products.card(decoy.product_name)).toHaveCount(0);

      await marketPage.filters.clear();

      await expect(marketPage.products.card(decoy.product_name)).toBeVisible();
      await expect(marketPage.filters.activeSummary).toHaveText('No active filters');
      await expect(marketPage.filters.categoryCheckbox('snacks')).not.toBeChecked();
    },
  );
});
