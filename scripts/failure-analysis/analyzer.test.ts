import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { analyze } from './analyze';
import { previousAnalysis } from './baseline';
import { LIKELY } from './cluster';
import { groupAttempts, type LoadedRun, loadRun } from './load';
import { renderMarkdown } from './render';
import {
  categorise,
  extractEndpoint,
  extractLocator,
  failingStepPath,
  locatorSegments,
  normalise,
  signature,
  sourceFrame,
  specLocation,
  stringLiterals,
} from './signals';
import { SourceIndex } from './source';
import { type AllureResult, type AllureStatus, type Analysis, type SourceRef } from './types';
import { ALLURE_CATEGORIES } from '../../src/config/allureCategories';
import { ANALYSIS } from '../../src/config/constants';
import { redactSecrets } from '../../src/utils/secrets';

const CWD = 'C:\\repo';

const tempDirs: string[] = [];
/** A fresh folder under the OS temp dir, removed when the tests finish. */
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'analyze-'));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});
/** Generous for one parse; a quadratic regex on 200k characters takes seconds. */
const LINEAR_BUDGET_MS = 250;

const GRID_SOURCE = [
  "this.root = page.locator('#productsGrid');",
  "this.cards = this.root.locator('.card');",
  'price(name: string): Locator {',
  "  return this.card(name).locator('.price');",
].join('\n');

const sources = new SourceIndex([
  {
    file: 'src/pages/MarketPage.ts',
    text: [
      "  @step('Open the Products tab')",
      '  async openProducts(): Promise<ProductGrid> {',
      "    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.products, () => this.productsTab.click());",
      '  }',
      '',
      "  @step('Open the Orders tab')",
      '  async openOrders(): Promise<OrdersPanel> {',
      "    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.orders, () => this.ordersTab.click());",
      '  }',
    ].join('\n'),
  },
  {
    file: 'src/pages/components/OrderSuccessModal.ts',
    text: [
      "  @step('View orders from the success modal')",
      '  async viewOrders(): Promise<this> {',
      "    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.orders, () => this.viewOrdersButton.click());",
      '  }',
    ].join('\n'),
  },
  {
    // The wait sits in an undecorated helper; the decorated methods calling it name the step.
    file: 'src/pages/components/FilterSidebar.ts',
    text: [
      '  @step((category: string) => `Filter by category ${category}`)',
      '  async filterByCategory(category: string): Promise<this> {',
      '    await this.refetching(() => this.chip(category).click());',
      '  }',
      '',
      '  private async refetching(action: () => Promise<unknown>): Promise<void> {',
      "    await whileAwaitingApi(this.page, 'GET', ENDPOINTS.products, action);",
      '  }',
    ].join('\n'),
  },
  {
    file: 'src/api/DocumentedApi.ts',
    text: [
      'async groceries(): Promise<Product[]> {',
      '  const body = await this.get<{ products: Product[] }>(DOCUMENTED_ENDPOINTS.groceries);',
    ].join('\n'),
  },
  { file: 'src/api/BasketApi.ts', text: 'export class BasketApi extends ApiClient {' },
  { file: 'src/pages/components/ProductGrid.ts', text: GRID_SOURCE },
  // Shares '.card' with the grid: must not win on that literal alone.
  {
    file: 'src/pages/components/BasketPanel.ts',
    text: [
      "this.items = page.locator('.card');",
      "  await whileAwaitingApi(this.page, 'DELETE', ENDPOINTS.basket, () =>",
    ].join('\n'),
  },
  {
    file: 'src/pages/components/OrdersPanel.ts',
    text: [
      "this.cards = this.root.locator('.order-card');",
      "this.confirmStatusButton = this.statusModal.getByRole('button', { name: 'Confirm' });",
      'status(orderNumber: string): Locator {',
      "  return this.card(orderNumber).locator('.order-status');",
    ].join('\n'),
  },
  {
    // The real client shape: every verb on the same ENDPOINTS entry, plain and with an id.
    file: 'src/api/ProductsApi.ts',
    text: [
      'async list(sort?: SortOrder): Promise<Product[]> {',
      '  const body = await this.get<{ products: Product[] }>(ENDPOINTS.products, { sort });',
      'filter(filter: ProductFilter): Promise<FilteredProduct[]> {',
      '  return this.get<FilteredProduct[]>(ENDPOINTS.productsFilter, { ...filter });',
      'getById(id: string): Promise<Product> {',
      '  return this.get<Product>(`${ENDPOINTS.products}/${id}`);',
      'create(input: ProductInput): Promise<Product> {',
      '  return this.post<Product>(ENDPOINTS.products, input);',
      'remove(id: string): Promise<ApiMessage> {',
      '  return this.delete(`${ENDPOINTS.products}/${id}`);',
    ].join('\n'),
  },
  {
    // A call Prettier wrapped: the verb sits a line above the path.
    file: 'src/api/OrdersApi.ts',
    text: [
      'async list(): Promise<Order[]> {',
      '  const body = await this.get<{ orders: Order[] }>(ENDPOINTS.orders);',
      'async place(notes?: string): Promise<Order> {',
      '  const body = await this.post<{ order: Order }>(',
      '    ENDPOINTS.orders,',
    ].join('\n'),
  },
]);

const statusMessage = (orderNumber: string): string =>
  [
    'Error: expect(locator).toHaveText(expected) failed',
    '',
    `Locator: locator('#ordersList').locator('.order-card').filter({ has: locator('.order-id').getByText('${orderNumber}', { exact: true }) }).locator('.order-status')`,
    'Error: element(s) not found',
  ].join('\n');

const priceMessage = (name: string): string =>
  [
    'Error: expect(locator).toHaveText(expected) failed',
    '',
    `Locator: locator('#productsGrid').locator('.card').filter({ has: getByRole('heading', { name: '${name}', exact: true }) }).locator('.price')`,
    'Expected: "$31.41"',
    'Timeout: 5000ms',
    'Error: element(s) not found',
  ].join('\n');

const apiMessage =
  'ApiError: GET /api/products/filter?category=bakery returned 404: {\n  "error": "Item not found"\n}';

let uuid = 0;
function result(
  name: string,
  status: AllureStatus,
  message = '',
  options: {
    retry?: number;
    repetition?: number;
    trace?: string;
    project?: string;
    feature?: string;
    steps?: AllureResult['steps'];
  } = {},
): AllureResult {
  uuid++;
  return {
    uuid: String(uuid),
    name,
    fullName: `spec.ts › Feature › ${name}`,
    status,
    statusDetails: {
      message,
      trace: options.trace ?? `${message}\n    at ${CWD}\\tests\\e2e\\products.spec.ts:29:61`,
    },
    steps: options.steps ?? [],
    labels: [{ name: 'feature', value: options.feature ?? 'Products' }],
    parameters: [
      { name: 'Project', value: options.project ?? 'e2e-chromium' },
      ...(options.retry ? [{ name: 'Retry', value: String(options.retry), excluded: true }] : []),
      ...(options.repetition ? [{ name: 'Repetition', value: String(options.repetition) }] : []),
    ],
    start: 1_000 + uuid,
  };
}

function runOf(results: AllureResult[], id = 'run-2'): LoadedRun {
  return { id, executor: id, start: 1_000, outcomes: groupAttempts(results), unreadable: [] };
}

const run = (
  results: AllureResult[],
  baseline: Analysis | null = null,
  needles: string[] = [],
): Analysis =>
  analyze(runOf(results), { resultsDir: 'allure-results', sources, needles, baseline, cwd: CWD });

describe('normalisation', () => {
  it('should mask generated names, ids and numbers when they differ per test', () => {
    assert.equal(
      normalise(
        `Delete "QA-17-adhjlxvf Oriental Fish" id 3fa85f64-5717-4562-b3fc-2c963f66afa6 after 5000ms`,
      ),
      'Delete "<name>" id :id after Nms',
    );
  });

  it('should keep the rest of the line when a generated name is not quoted', () => {
    assert.equal(
      normalise('Product QA-1-abcd1234 Bread not in basket after 3 tries'),
      'Product <name> Bread not in basket after N tries',
    );
  });

  it('should mask the whole label when it contains the other quote character', () => {
    assert.equal(normalise('"QA-1-abcd1234 Bob\'s Bread"'), '"<name>"');
  });

  it('should mask a name when it was generated outside a test worker', () => {
    assert.equal(normalise("'QA-x-abcd1234 Seed Milk'"), "'<name>'");
  });

  it('should keep only the first line when building a signature', () => {
    assert.equal(
      signature(apiMessage),
      'ApiError: GET /api/products/filter?category=bakery returned N: {',
    );
  });
});

describe('locators', () => {
  it('should read the locator with test data masked when an expect fails', () => {
    assert.equal(
      extractLocator(priceMessage('QA-3-abc12345 Fresh Bread')),
      "locator('#productsGrid').locator('.card').filter({ has: getByRole('heading', { name: '<name>', exact: true }) }).locator('.price')",
    );
  });

  it('should read the locator from the call log when an action times out', () => {
    const message =
      "TimeoutError: locator.fill: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('#productStock')\n";
    assert.equal(extractLocator(message), "locator('#productStock')");
  });

  it('should read the locator when it matches several elements', () => {
    assert.equal(
      extractLocator(
        "Error: locator.click: Error: strict mode violation: locator('div') resolved to 52 elements:",
      ),
      "locator('div')",
    );
  });

  it('should split only at top-level dots when a chain has nested locators', () => {
    const segments = locatorSegments(
      "locator('#a.b').filter({ has: getByRole('heading', { name: 'x.y' }) }).locator('.c')",
    );
    assert.deepEqual(segments, [
      "locator('#a.b')",
      "filter({ has: getByRole('heading', { name: 'x.y' }) })",
      "locator('.c')",
    ]);
    assert.deepEqual(stringLiterals(segments[1] ?? ''), ['heading', 'x.y']);
  });

  it('should mask a text value only when no page object writes it', () => {
    assert.equal(
      sources.maskDynamicText(
        "locator('.order-id').getByText('ORD-1001', { exact: true }).getByRole('button', { name: 'Confirm' })",
      ),
      "locator('.order-id').getByText('<text>', { exact: true }).getByRole('button', { name: 'Confirm' })",
    );
  });

  it('should map a locator to the page object holding most of its literals when one is shared', () => {
    assert.deepEqual(
      sources.findLocator("locator('#productsGrid').locator('.card').locator('.price')"),
      { file: 'src/pages/components/ProductGrid.ts', line: 4 },
    );
  });
});

describe('endpoints', () => {
  it('should read method, path and status when an API call fails', () => {
    assert.deepEqual(extractEndpoint(apiMessage), {
      method: 'GET',
      path: '/api/products/filter',
      status: 404,
    });
    assert.deepEqual(
      extractEndpoint(
        'Error: DELETE /api/products/3fa85f64-5717-4562-b3fc-2c963f66afa6 returned 500: ',
      ),
      { method: 'DELETE', path: '/api/products/:id', status: 500 },
    );
    assert.equal(extractEndpoint('Error: expect(received).toBe(expected)'), null);
  });

  it('should stay linear when a URL is 40k characters long', () => {
    const started = performance.now();
    assert.deepEqual(
      extractEndpoint(`Error: GET /${'a'.repeat(40_000)}?q=1 returned 404: x`)?.status,
      404,
    );
    assert.equal(extractEndpoint(`GET /${'a'.repeat(40_000)}`), null);
    assert.ok(performance.now() - started < LINEAR_BUDGET_MS, 'endpoint parsing must stay linear');
  });

  it('should map to the page object when a UI wait sees the failed response', () => {
    const analysis = run([
      result(
        'remove',
        'failed',
        'Error: DELETE /api/basket/3fa85f64-5717-4562-b3fc-2c963f66afa6 returned 500: {}',
      ),
    ]);
    assert.deepEqual(analysis.clusters[0]?.component, {
      file: 'src/pages/components/BasketPanel.ts',
      line: 2,
    });
  });

  it('should map to the client line with the same verb and path form when one entry has several calls', () => {
    const at = (method: string, path: string): SourceRef | null =>
      sources.findEndpoint({ method, path });
    assert.deepEqual(at('GET', '/api/products/filter'), {
      file: 'src/api/ProductsApi.ts',
      line: 4,
    });
    assert.deepEqual(at('GET', '/api/products'), { file: 'src/api/ProductsApi.ts', line: 2 });
    assert.deepEqual(at('POST', '/api/products'), { file: 'src/api/ProductsApi.ts', line: 8 });
    assert.deepEqual(at('GET', '/api/products/:id'), { file: 'src/api/ProductsApi.ts', line: 6 });
    assert.deepEqual(at('DELETE', '/api/products/:id'), {
      file: 'src/api/ProductsApi.ts',
      line: 10,
    });
    assert.deepEqual(at('POST', '/api/orders'), { file: 'src/api/OrdersApi.ts', line: 5 });
    // A path no entry declares (a typo'd endpoint) is not pinned on a neighbour.
    assert.equal(at('GET', '/api/products/filtr'), null);
  });
});

describe('categories', () => {
  it('should categorise like the Allure report when several rules could match', () => {
    assert.equal(categorise('failed', apiMessage, ''), 'API 4xx');
    assert.equal(categorise('failed', 'ApiError: GET /api/basket returned 401: {}', ''), 'Auth');
    assert.equal(categorise('failed', priceMessage('x'), ''), 'Locator not found');
    assert.equal(
      categorise('failed', 'Error: expect(received).toBe(expected)', ''),
      'Product errors',
    );
    assert.equal(categorise('skipped', 'PRODUCT DEFECT: x', ''), 'Known product defect');
  });

  it('should use the trace and the call log when the message alone is ambiguous', () => {
    assert.equal(
      categorise(
        'failed',
        "Cannot read properties of undefined (reading 'id')",
        'TypeError: Cannot read',
      ),
      'Test defect',
    );
    const actionTimeout = (log: string): string =>
      `TimeoutError: locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('#a')\n${log}`;
    assert.equal(categorise('failed', actionTimeout(''), ''), 'Locator not found');
    assert.equal(
      categorise('failed', actionTimeout('  - locator resolved to <button disabled>'), ''),
      'Timeout',
    );
  });

  it('should have a likely class and hint when a category is defined', () => {
    for (const { name } of ALLURE_CATEGORIES) {
      if (name === 'Known product defect') continue; // Skipped tests are never clustered.
      assert.ok(LIKELY[name], name);
    }
  });
});

describe('steps and frames', () => {
  it('should follow the first failed step down to the action when steps are nested', () => {
    const steps = [
      { name: 'Before Hooks', status: 'passed' as const },
      {
        name: 'Fill the product form',
        status: 'failed' as const,
        steps: [{ name: 'Fill "22"', status: 'failed' as const }],
      },
    ];
    assert.equal(failingStepPath(steps), 'Fill the product form > Fill "N"');
  });

  it('should stay linear when the trace carries a 200k-character diff', () => {
    const diff = 'that cat sat at the mat '.repeat(8_500);
    const trace = [
      'Error: expect(locator).toHaveText(expected) failed',
      diff,
      diff,
      '    at ProductsApi.send (\\src\\api\\ApiClient.ts:67:20)',
      '    at \\tests\\e2e\\a.spec.ts:9:3',
    ].join('\n');
    const started = performance.now();
    assert.deepEqual(specLocation(trace), { file: 'tests/e2e/a.spec.ts', line: 9 });
    assert.deepEqual(sourceFrame(trace), {
      file: 'src/api/ApiClient.ts',
      line: 67,
      symbol: 'ProductsApi.send',
    });
    assert.ok(performance.now() - started < LINEAR_BUDGET_MS, 'frame parsing must stay linear');
  });

  it('should skip node_modules and keep the symbol when frames are async or constructors', () => {
    const trace = [
      'Error: x',
      '    at run (C:\\repo\\node_modules\\lib\\src\\x.js:1:2)',
      '    at new ApiError (\\src\\api\\ApiClient.ts:24:5)',
      '    at async OrdersApi.place (\\src\\api\\OrdersApi.ts:17:3)',
    ].join('\n');
    assert.deepEqual(sourceFrame(trace), {
      file: 'src/api/ApiClient.ts',
      line: 24,
      symbol: 'ApiError',
    });
  });

  it('should keep the symbol and the repo path when a frame has an alias or an absolute path', () => {
    assert.deepEqual(
      sourceFrame(
        '    at ProductGrid.increase [as inc] (\\src\\pages\\components\\ProductGrid.ts:85:5)',
      ),
      { file: 'src/pages/components/ProductGrid.ts', line: 85, symbol: 'ProductGrid.increase' },
    );
    assert.deepEqual(
      sourceFrame('    at run (/home/ci/tests/checkout/src/api/OrdersApi.ts:17:3)'),
      {
        file: 'src/api/OrdersApi.ts',
        line: 17,
        symbol: 'run',
      },
    );
  });

  it('should stay linear when a frame location or a locator is 100k characters long', () => {
    const started = performance.now();
    assert.equal(sourceFrame(`    at ${'src/'.repeat(25_000)}x.ts`), null);
    sources.maskDynamicText(`getByRole('button', { name:${' '.repeat(100_000)}'Save' })`);
    assert.ok(performance.now() - started < LINEAR_BUDGET_MS, 'parsing must stay linear');
  });

  it('should find the spec line when the trace has one', () => {
    assert.deepEqual(specLocation('Error\n    at \\tests\\api\\orders.api.spec.ts:12:5'), {
      file: 'tests/api/orders.api.spec.ts',
      line: 12,
    });
  });
});

describe('attempts', () => {
  it('should count each repetition as its own run when using --repeat-each', () => {
    const outcomes = groupAttempts([
      result('r', 'failed', 'boom', { repetition: 1 }),
      result('r', 'failed', 'boom', { repetition: 2 }),
      result('r', 'passed', '', { repetition: 3 }),
    ]);
    assert.deepEqual(
      outcomes.map((o) => [o.repetition, o.final.status, o.flaky]),
      [
        [1, 'failed', false],
        [2, 'failed', false],
        [3, 'passed', false],
      ],
    );
  });

  it('should flag a test as flaky when it passes on retry', () => {
    const outcomes = groupAttempts([
      result('a', 'failed', 'boom'),
      result('a', 'passed', '', { retry: 1 }),
      result('b', 'failed', 'boom'),
      result('b', 'failed', 'boom', { project: 'api' }),
    ]);
    assert.deepEqual(
      outcomes.map((o) => [o.id, o.attempts.length, o.final.status, o.flaky]),
      [
        ['api › spec.ts › Feature › b', 1, 'failed', false],
        ['e2e-chromium › spec.ts › Feature › a', 2, 'passed', true],
        ['e2e-chromium › spec.ts › Feature › b', 1, 'failed', false],
      ],
    );
  });
});

describe('loading', () => {
  it('should skip a result and use the earliest start as run id when a file is unreadable and there is no executor', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a-result.json'), JSON.stringify(result('ok', 'passed')));
    writeFileSync(join(dir, 'b-result.json'), '{"uuid": "cut off mid-wr');
    const loaded = loadRun(dir);
    assert.equal(loaded.outcomes.length, 1);
    assert.deepEqual(loaded.unreadable, ['b-result.json']);
    assert.equal(loaded.executor, null);
    assert.equal(loaded.id, new Date(loaded.start ?? 0).toISOString());
  });
});

describe('previous run', () => {
  const analysisOf = (id: string, start: string): Analysis => ({
    ...run([]),
    run: { id, executor: id, start, resultsDir: 'allure-results' },
  });
  const save = (dir: string, file: string, analysis: Analysis | string): void => {
    writeFileSync(
      join(dir, file),
      typeof analysis === 'string' ? analysis : JSON.stringify(analysis),
    );
  };
  const first = { id: 'run-1', start: '2026-11-01T00:00:00.000Z' };
  const second = { id: 'run-2', start: '2026-11-02T00:00:00.000Z' };

  it('should have no baseline when no run was analysed before', () => {
    assert.equal(previousAnalysis(first, tempDir()), null);
  });

  it('should keep the latest analysis as the baseline when a newer run is analysed', () => {
    const dir = tempDir();
    save(dir, ANALYSIS.jsonFile, analysisOf(first.id, first.start));
    assert.equal(previousAnalysis(second, dir)?.run.id, 'run-1');
    // Re-analysing the same run keeps comparing with the run before it.
    save(dir, ANALYSIS.jsonFile, analysisOf(second.id, second.start));
    assert.equal(previousAnalysis(second, dir)?.run.id, 'run-1');
  });

  it('should not compare a run with itself when the latest analysis is corrupt', () => {
    const dir = tempDir();
    save(dir, ANALYSIS.jsonFile, '{ not json');
    save(dir, ANALYSIS.previousFile, analysisOf(second.id, second.start));
    assert.equal(previousAnalysis(second, dir), null);
  });

  it('should keep the run before as baseline when an older folder was analysed in between', () => {
    const dir = tempDir();
    const older = { id: 'run-0', start: '2026-10-31T00:00:00.000Z' };
    save(dir, ANALYSIS.jsonFile, analysisOf(first.id, first.start));
    assert.equal(previousAnalysis(second, dir)?.run.id, 'run-1');
    save(dir, ANALYSIS.jsonFile, analysisOf(second.id, second.start));
    assert.equal(previousAnalysis(older, dir), null);
    save(dir, ANALYSIS.jsonFile, analysisOf(older.id, older.start));
    assert.equal(previousAnalysis(second, dir)?.run.id, 'run-1');
  });

  it('should not rotate the latest analysis when an older run is analysed', () => {
    const dir = tempDir();
    save(dir, ANALYSIS.jsonFile, analysisOf(second.id, second.start));
    assert.equal(previousAnalysis(first, dir), null);
  });
});

describe('secrets', () => {
  it('should mask the longest secret first when one contains another', () => {
    assert.equal(
      redactSecrets('key=abc123-secret-xyz', ['abc123', 'abc123-secret-xyz']),
      'key=***',
    );
  });
});

describe('analysis', () => {
  const broken = [
    result('create', 'failed', priceMessage('QA-1-aaaa1111 Bread')),
    result('edit', 'failed', priceMessage('QA-2-bbbb2222 Milk')),
    result('list', 'failed', priceMessage('QA-3-cccc3333 Eggs')),
    result('filter', 'failed', apiMessage, { project: 'api' }),
    result('passes', 'passed'),
    result('parked', 'skipped', 'PRODUCT DEFECT: prices can be negative', { feature: 'Products' }),
  ];

  it('should form one cluster naming the locator and page object when one locator breaks', () => {
    const analysis = run(broken);
    const first = analysis.clusters[0];
    const second = analysis.clusters[1];
    assert.equal(analysis.clusters.length, 2);
    assert.ok(first && second);
    assert.equal(first.id, 'C1');
    assert.equal(first.size, 3);
    assert.equal(first.category, 'Locator not found');
    assert.equal(first.sharedRootCause, true);
    assert.match(first.title, /locator\('\.price'\)/);
    assert.deepEqual(first.component, { file: 'src/pages/components/ProductGrid.ts', line: 4 });
    assert.deepEqual(second.endpoint, {
      method: 'GET',
      path: '/api/products/filter',
      status: 404,
    });
    assert.equal(second.sharedRootCause, false);
    assert.deepEqual(
      analysis.knownDefects.map((d) => d.reason),
      ['prices can be negative'],
    );
    assert.deepEqual(analysis.summary, {
      tests: 6,
      passed: 1,
      failed: 4,
      flaky: 0,
      skipped: 1,
      knownDefects: 1,
      clusters: 2,
    });
  });

  it('should mark recurring and resolved clusters when compared with the previous run', () => {
    const previous = run(broken);
    const analysis = run(
      broken.filter((r) => r.name !== 'filter'),
      previous,
    );
    assert.deepEqual(
      analysis.clusters.map((c) => c.history),
      ['recurring'],
    );
    assert.deepEqual(
      analysis.resolved.map((r) => r.title),
      ['API 4xx: GET /api/products/filter → 404'],
    );
    assert.equal(analysis.previousRunId, 'run-2');
  });

  it('should list a test as flaky, not as a cluster, when it passed on retry', () => {
    const analysis = run([
      result('wobbly', 'failed', 'TimeoutError: page.waitForResponse: Timeout 10000ms exceeded.'),
      result('wobbly', 'passed', '', { retry: 1 }),
    ]);
    assert.equal(analysis.clusters.length, 0);
    assert.deepEqual(
      analysis.flaky.map((f) => [f.test.name, f.category]),
      [['wobbly', 'Timeout']],
    );
  });

  it('should form one cluster when one orders locator breaks across order numbers', () => {
    const analysis = run([
      result('ship', 'failed', statusMessage('ORD-1001')),
      result('cancel', 'failed', statusMessage('ORD-2002')),
    ]);
    const cluster = analysis.clusters[0];
    assert.equal(analysis.clusters.length, 1);
    assert.ok(cluster);
    assert.equal(cluster.size, 2);
    assert.match(cluster.locator ?? '', /getByText\('<text>'/);
    assert.deepEqual(cluster.component, {
      file: 'src/pages/components/OrdersPanel.ts',
      line: 4,
    });
  });

  it('should not merge generic assertion failures when they happen in different places', () => {
    const toBe = 'Error: expect(received).toBe(expected) // Object.is equality';
    const specAt = (line: number): string =>
      [toBe, `    at ${CWD}\\tests\\api\\orders.api.spec.ts:${line}:5`].join('\n');
    const helperCalledFrom = (line: number): string =>
      [
        toBe,
        `    at expectOrderTotals (${CWD}\\src\\utils\\assertions.ts:20:3)`,
        `    at ${CWD}\\tests\\api\\orders.api.spec.ts:${line}:1`,
      ].join('\n');
    const analysis = run([
      result('total', 'failed', toBe, { trace: specAt(40) }),
      result('stock', 'failed', toBe, { trace: specAt(80) }),
      // Two specs failing inside one shared helper are one cause.
      result('helper a', 'failed', toBe, { trace: helperCalledFrom(10) }),
      result('helper b', 'failed', toBe, { trace: helperCalledFrom(20) }),
    ]);
    assert.deepEqual(
      analysis.clusters.map((c) => c.size),
      [2, 1, 1],
    );
  });

  it('should form one cluster when one page-object step fails the same way from several specs', () => {
    const failed = 'Error: POST /api/orders returned no order';
    const placeOrder = [{ name: 'Place the order', status: 'failed' as const }];
    const calledFrom = (line: number): string =>
      [failed, `    at ${CWD}\\tests\\e2e\\checkout.spec.ts:${line}:5`].join('\n');
    const analysis = run([
      result('a', 'failed', failed, { trace: calledFrom(20), steps: placeOrder }),
      result('b', 'failed', failed, { trace: calledFrom(45), steps: placeOrder }),
      result('c', 'failed', failed, { trace: calledFrom(70), steps: placeOrder }),
    ]);
    assert.deepEqual(
      analysis.clusters.map((c) => c.size),
      [3],
    );
  });

  it('should name the page object whose step saw the response when several wait on the same call', () => {
    const fromStep = (step: string): SourceRef | null =>
      run([
        result('tab', 'failed', 'Error: GET /api/orders returned 500: {}', {
          steps: [{ name: step, status: 'failed' }],
        }),
      ]).clusters[0]?.component ?? null;
    assert.deepEqual(fromStep('Open the Orders tab'), { file: 'src/pages/MarketPage.ts', line: 8 });
    assert.deepEqual(fromStep('View orders from the success modal'), {
      file: 'src/pages/components/OrderSuccessModal.ts',
      line: 3,
    });
    // Reached through the undecorated helper the step calls.
    assert.deepEqual(
      sources.findUiWait({ method: 'GET', path: '/api/products' }, 'Filter by category bakery'),
      { file: 'src/pages/components/FilterSidebar.ts', line: 7 },
    );
    // Two candidates and no step to tell them apart: no guess.
    assert.equal(sources.findUiWait({ method: 'GET', path: '/api/orders' }, null), null);
  });

  it('should name the documented client or the client class when ApiClient is the only frame', () => {
    const documented = run([
      result('contract', 'failed', 'ApiError: GET /api/groceries returned 500: {}', {
        project: 'api',
      }),
    ]);
    assert.deepEqual(documented.clusters[0]?.component, {
      file: 'src/api/DocumentedApi.ts',
      line: 2,
    });
    const typo = run([
      result('typo', 'failed', 'ApiError: GET /api/baskett returned 404: {}', {
        project: 'api',
        trace: [
          'ApiError: GET /api/baskett returned 404: {}',
          `    at BasketApi.send (${CWD}\\src\\api\\ApiClient.ts:67:20)`,
          `    at ${CWD}\\tests\\api\\basket.api.spec.ts:30:5`,
        ].join('\n'),
      }),
    ]);
    assert.deepEqual(typo.clusters[0]?.component, {
      file: 'src/api/BasketApi.ts',
      line: 1,
      symbol: 'BasketApi',
    });
  });

  it('should not break the JSON when a secret matches across an escape', () => {
    // The JSON of a newline followed by "ightly-pass2" reads \nightly-pass2: the secret is not there.
    const analysis = run(
      [result('escape', 'failed', 'Error: got\nightly-pass2 and nightly-pass')],
      null,
      ['nightly-pass'],
    );
    assert.equal(analysis.clusters[0]?.example, 'Error: got\nightly-pass2 and ***');
  });

  it('should not merge test timeouts when they ran out in different steps', () => {
    const timeout = 'Test timeout of 30000ms exceeded.';
    const stuckIn = (name: string): AllureResult['steps'] => [{ name, status: 'broken' }];
    const analysis = run([
      result('a', 'failed', timeout, { trace: timeout, steps: stuckIn('Open the basket') }),
      result('b', 'failed', timeout, {
        trace: timeout,
        steps: stuckIn('Delete "x" from its card'),
      }),
    ]);
    assert.equal(analysis.clusters.length, 2);
  });

  it('should mask a secret when it appears in the error, a step or a title', () => {
    const analysis = run(
      [
        result('leak s3cr3t-key-value in the title', 'failed', 'Error: got s3cr3t-key-value back', {
          steps: [{ name: 'Type s3cr3t-key-value', status: 'failed' }],
        }),
      ],
      null,
      ['s3cr3t-key-value'],
    );
    const written = JSON.stringify(analysis) + renderMarkdown(analysis);
    assert.equal(written.includes('s3cr3t-key-value'), false);
    assert.match(analysis.clusters[0]?.example ?? '', /\*\*\*/);
  });

  it('should keep the Markdown intact when an error quotes a code fence or a pipe', () => {
    const analysis = run([
      result('quoting', 'failed', 'Error: expected | to render\n```js\nx\n```'),
      result('parked', 'skipped', 'PRODUCT DEFECT: totals drift'),
    ]);
    const markdown = renderMarkdown(analysis);
    assert.ok(markdown.includes('````text'), 'the example fence outgrows the fence it quotes');
    assert.ok(markdown.includes('single test'));
    assert.ok(markdown.includes('totals drift (parked)'));
    assert.ok(markdown.includes('**2 tests:**'));
    assert.ok(markdown.includes('expected \\| to render'), 'the pipe is escaped in the table');
  });

  it('should render every fixed section when there are clusters', () => {
    const markdown = renderMarkdown(run(broken));
    for (const heading of [
      '# Failure analysis',
      '## Clusters',
      '### C1 · Locator not found',
      '## Flaky (passed on retry)',
      '## Known product defects (skipped)',
      '## Resolved since the previous run',
    ]) {
      assert.ok(markdown.includes(heading), heading);
    }
  });
});
