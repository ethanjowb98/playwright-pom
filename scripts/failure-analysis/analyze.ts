import { clusterFailures } from './cluster';
import { type LoadedRun } from './load';
import {
  categorise,
  extractEndpoint,
  extractLocator,
  failingStepPath,
  signature,
  sourceFrame,
  specLocation,
} from './signals';
import { type SourceIndex } from './source';
import {
  type AllureResult,
  type Analysis,
  type Failure,
  type FlakyTest,
  isFailure,
  type KnownDefect,
  type TestOutcome,
  type SourceRef,
  type TestRef,
} from './types';
import { ALLURE, ANALYSIS } from '../../src/config/constants';
import { redactSecrets } from '../../src/utils/secrets';

export interface AnalyzeOptions {
  resultsDir: string;
  sources: SourceIndex;
  /** Secret variants to mask in everything written (`secretNeedles`). */
  needles: readonly string[];
  /** The previous run's analysis, for new-vs-recurring; `null` on the first run. */
  baseline: Analysis | null;
  /** Absolute repo path, stripped from stack frames. */
  cwd: string;
  now?: Date;
}

function testRef(outcome: TestOutcome, attempt: AllureResult, cwd: string): TestRef {
  return {
    name: outcome.name,
    fullName: outcome.fullName,
    project: outcome.project,
    repetition: outcome.repetition,
    feature: outcome.feature,
    location: specLocation(stripCwd(attempt.statusDetails?.trace ?? '', cwd)),
    attempts: outcome.attempts.length,
    flaky: outcome.flaky,
  };
}

const stripCwd = (text: string, cwd: string): string => text.split(cwd).join('');

const API_CLIENT_ERROR = /^ApiError\b/;
const API_CLIENT_FILE = 'src/api/ApiClient.ts';

/**
 * Masks secrets in every string written, not only the error text: step names, test titles, defect
 * reasons and titles carried over from the previous analysis. Each string value is masked on its own:
 * masking the serialised JSON could cut through an escape (`\n` + a secret starting with `n`).
 */
function redactAll(analysis: Analysis, needles: readonly string[]): Analysis {
  if (needles.length === 0) return analysis;
  return JSON.parse(
    JSON.stringify(analysis, (_key, value: unknown) =>
      typeof value === 'string' ? redactSecrets(value, needles) : value,
    ),
  ) as Analysis;
}

/**
 * The innermost `src/` frame, except the shared `ApiClient` plumbing (`ProductsApi.send` in
 * `ApiClient.ts` is never the cause): that names the client class it ran for instead.
 */
function suiteFrame(trace: string, sources: SourceIndex): SourceRef | null {
  const frame = sourceFrame(trace);
  if (frame?.file !== API_CLIENT_FILE) return frame;
  const client = frame.symbol?.split('.')[0];
  return (client ? sources.findClass(client) : null) ?? frame;
}

/** Reads the cause out of one failed attempt. */
export function describeFailure(
  outcome: TestOutcome,
  attempt: AllureResult,
  sources: SourceIndex,
  needles: readonly string[],
  cwd: string,
): Failure {
  const message = redactSecrets(attempt.statusDetails?.message ?? '', needles);
  const trace = stripCwd(redactSecrets(attempt.statusDetails?.trace ?? '', needles), cwd);
  const steps = attempt.steps ?? [];
  const raw = extractLocator(message);
  const locator = raw === null ? null : sources.maskDynamicText(raw);
  const endpoint = locator ? null : extractEndpoint(message);
  const failingStep = failingStepPath(steps);
  const component =
    (locator === null ? null : sources.findLocator(locator)) ??
    (endpoint === null
      ? null
      : // `ApiError` comes from an API client; a plain `Error` from a page object's `whileAwaitingApi`.
        API_CLIENT_ERROR.test(message)
        ? sources.findEndpoint(endpoint)
        : sources.findUiWait(endpoint, failingStep)) ??
    suiteFrame(trace, sources);
  return {
    test: testRef(outcome, attempt, cwd),
    category: categorise(attempt.status, message, trace),
    signature: signature(message),
    locator,
    endpoint,
    failingStep,
    component,
    message: message.slice(0, ANALYSIS.messageExcerptLength),
  };
}

export function analyze(
  run: LoadedRun,
  { resultsDir, sources, needles, baseline, cwd, now = new Date() }: AnalyzeOptions,
): Analysis {
  const failed = run.outcomes.filter((outcome) => isFailure(outcome.final.status));
  const failures = failed.map((outcome) =>
    describeFailure(outcome, outcome.final, sources, needles, cwd),
  );

  const flaky: FlakyTest[] = run.outcomes
    .filter((outcome) => outcome.flaky)
    .flatMap((outcome) => {
      const first = outcome.attempts.find((attempt) => isFailure(attempt.status));
      if (!first) return [];
      const failure = describeFailure(outcome, first, sources, needles, cwd);
      return [{ test: failure.test, firstError: failure.signature, category: failure.category }];
    });

  const knownDefects: KnownDefect[] = run.outcomes
    .filter(
      (outcome) =>
        outcome.final.status === 'skipped' &&
        (outcome.final.statusDetails?.message ?? '').startsWith(ALLURE.productDefectPrefix),
    )
    .map((outcome) => ({
      test: testRef(outcome, outcome.final, cwd),
      reason: (outcome.final.statusDetails?.message ?? '')
        .slice(ALLURE.productDefectPrefix.length)
        .trim(),
    }));

  const previousKeys = new Set(baseline?.clusters.map((cluster) => cluster.key) ?? []);
  const clusters = clusterFailures(failures).map((cluster, index) => ({
    id: `C${index + 1}`,
    ...cluster,
    history: previousKeys.has(cluster.key) ? ('recurring' as const) : ('new' as const),
  }));
  const currentKeys = new Set(clusters.map((cluster) => cluster.key));

  const analysis: Analysis = {
    schemaVersion: ANALYSIS.schemaVersion,
    generatedAt: now.toISOString(),
    run: {
      id: run.id,
      executor: run.executor,
      start: run.start === null ? null : new Date(run.start).toISOString(),
      resultsDir,
    },
    previousRunId: baseline?.run.id ?? null,
    summary: {
      tests: run.outcomes.length,
      passed: run.outcomes.filter((o) => o.final.status === 'passed').length,
      failed: failed.length,
      flaky: flaky.length,
      skipped: run.outcomes.filter((o) => o.final.status === 'skipped').length,
      knownDefects: knownDefects.length,
      clusters: clusters.length,
    },
    clusters,
    flaky,
    knownDefects,
    resolved: (baseline?.clusters ?? [])
      .filter((cluster) => !currentKeys.has(cluster.key))
      .map(({ key, title, size }) => ({ key, title, size })),
  };
  return redactAll(analysis, needles);
}
