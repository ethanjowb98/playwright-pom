/** The subset of allure-playwright's `*-result.json` the analyzer reads. */
export type AllureStatus = 'passed' | 'failed' | 'broken' | 'skipped' | 'unknown';

export const isFailure = (status: AllureStatus): boolean =>
  status === 'failed' || status === 'broken';

export interface StatusDetails {
  message?: string;
  trace?: string;
}

/** A step; attachments are recorded as status-less child steps named after the attachment. */
export interface AllureStep {
  name: string;
  status?: AllureStatus;
  statusDetails?: StatusDetails;
  steps?: AllureStep[];
}

export interface AllureResult {
  uuid: string;
  name: string;
  fullName?: string;
  status: AllureStatus;
  statusDetails?: StatusDetails;
  steps?: AllureStep[];
  labels: { name: string; value: string }[];
  parameters?: { name: string; value: string; excluded?: boolean }[];
  start?: number;
  stop?: number;
}

/** Every attempt of one test run (`fullName` + project, + repetition under `--repeat-each`), oldest first. */
export interface TestOutcome {
  id: string;
  name: string;
  fullName: string;
  project: string;
  /** Set under `--repeat-each`: which repetition this is. */
  repetition: number | null;
  feature: string | null;
  attempts: AllureResult[];
  final: AllureResult;
  /** Failed at least once, then passed on a retry. */
  flaky: boolean;
}

export interface SourceRef {
  file: string;
  line: number;
  /** The class or class.method from the stack frame, when known. */
  symbol?: string;
}

export interface Endpoint {
  method: string;
  /** Ids replaced by `:id`, query removed. */
  path: string;
  status: number;
}

export interface TestRef {
  name: string;
  fullName: string;
  project: string;
  repetition: number | null;
  feature: string | null;
  /** The spec line the failure surfaced at. */
  location: SourceRef | null;
  attempts: number;
  flaky: boolean;
}

/** What one failed attempt says about its cause. */
export interface Failure {
  test: TestRef;
  /** The Allure category (`src/config/allureCategories.ts`), else Allure's built-in `Product errors`. */
  category: string;
  /** Normalised first error line: test-data names, ids and numbers replaced. */
  signature: string;
  /** Normalised locator chain from the error or call log. */
  locator: string | null;
  endpoint: Endpoint | null;
  /** Normalised path of failed steps, outermost first. */
  failingStep: string | null;
  /** Where the cause most likely lives: the locator's or endpoint's source line, else a `src/` frame. */
  component: SourceRef | null;
  /** Redacted, shortened error message. */
  message: string;
}

export type LikelyClass = 'product defect' | 'test defect' | 'flaky' | 'environment';

export interface Cluster {
  id: string;
  /** Stable across runs: compared for new-vs-recurring. */
  key: string;
  title: string;
  size: number;
  category: string;
  likely: LikelyClass;
  hint: string;
  sharedRootCause: boolean;
  history: 'new' | 'recurring';
  signature: string;
  locator: string | null;
  endpoint: Endpoint | null;
  failingStep: string | null;
  component: SourceRef | null;
  /** The first member's error, redacted and shortened. */
  example: string;
  tests: TestRef[];
}

export interface FlakyTest {
  test: TestRef;
  /** Signature of the first failed attempt. */
  firstError: string;
  category: string;
}

export interface KnownDefect {
  test: TestRef;
  reason: string;
}

export interface Analysis {
  schemaVersion: number;
  generatedAt: string;
  run: { id: string; executor: string | null; start: string | null; resultsDir: string };
  previousRunId: string | null;
  summary: {
    tests: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    knownDefects: number;
    clusters: number;
  };
  clusters: Cluster[];
  flaky: FlakyTest[];
  knownDefects: KnownDefect[];
  /** Clusters of the previous run that no longer fail. */
  resolved: { key: string; title: string; size: number }[];
}
