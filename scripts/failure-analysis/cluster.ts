import { locatorSegments } from './signals';
import {
  type Cluster,
  type Endpoint,
  type Failure,
  type LikelyClass,
  type SourceRef,
} from './types';
import { ALLURE_CATEGORIES } from '../../src/config/allureCategories';
import { ANALYSIS } from '../../src/config/constants';

/** Ranking tie-break: causes that break many tests at once (auth, outages) first. */
const CATEGORY_ORDER = [
  ...ALLURE_CATEGORIES.map((category) => category.name),
  'Product errors',
  'Test errors',
];

interface Likely {
  likely: LikelyClass;
  hint: string;
}

const UNCLASSIFIED: Likely = {
  likely: 'product defect',
  hint: 'An assertion failed while the app was reachable: a product defect, or a wrong expectation. Compare the expected value with the API or UI evidence.',
};

/**
 * Keyed by category name: a unit test checks every category in `allureCategories.ts` has an entry,
 * so renaming one there cannot silently fall back to `UNCLASSIFIED`.
 */
export const LIKELY: Record<string, Likely> = {
  Auth: {
    likely: 'environment',
    hint: 'Check the credentials (.env / GitHub secrets), the api key in .auth/, and the login budget: a 429 from /api/login means wait 15 minutes.',
  },
  'API 5xx': {
    likely: 'environment',
    hint: 'The server failed; read the response attachment. If one endpoint fails the same way on every run, report it as a product defect.',
  },
  'API 4xx': {
    likely: 'test defect',
    hint: 'The API rejected the request: a wrong path or payload in the client, or missing seeded data. A 404 on every call to one path usually means a wrong endpoint.',
  },
  'Test defect': {
    likely: 'test defect',
    hint: 'A bug in the test code (a JavaScript error, or a locator matching several elements).',
  },
  'Locator not found': {
    likely: 'test defect',
    hint: 'The locator matched nothing: a stale selector in the page object, or the UI changed (then it is a product defect if the change is unintended).',
  },
  Timeout: {
    likely: 'flaky',
    hint: 'A wait ran out with the element present: slow app or a state that never arrived. Rerun to see whether it is timing-dependent.',
  },
  'Product errors': UNCLASSIFIED,
  'Test errors': {
    likely: 'test defect',
    hint: 'The test broke before it could assert; read the stack.',
  },
};

export const endpointText = ({ method, path, status }: Endpoint): string =>
  `${method} ${path} → ${status}`;

/** The cause in a few words: the locator's last segment, else the endpoint, else the signature. */
export function shortCause(cause: Pick<Failure, 'locator' | 'endpoint' | 'signature'>): string {
  if (cause.locator) return locatorSegments(cause.locator).at(-1) ?? cause.locator;
  if (cause.endpoint) return endpointText(cause.endpoint);
  return cause.signature.length > ANALYSIS.titleLength
    ? `${cause.signature.slice(0, ANALYSIS.titleLength - 3)}...`
    : cause.signature;
}

/** What the cluster is keyed on: the full locator, else the endpoint, else the error signature. */
function causeOf(failure: Failure): string {
  if (failure.locator) return `locator ${failure.locator}`;
  if (failure.endpoint) return endpointText(failure.endpoint);
  return failure.signature;
}

/** Steps a spec writes itself (`expect`), as opposed to page-object, client and seeder steps. */
const SPEC_LEVEL_STEP = 'Expect "';

/**
 * A signature alone is too generic to key on: `expect(received).toBe(expected)` and
 * `Test timeout of Nms exceeded.` read the same for unrelated causes. So it is anchored to where the
 * failure happened:
 * - inside a page-object, client or seeder step (or a hook): the step path alone. A boxed step's
 *   stack carries only the calling spec line, and one broken step is one cause wherever it is called.
 * - a spec-level `expect`, or no step: the step plus the suite line (a shared helper) or spec line.
 */
function anchorOf(failure: Failure): string {
  if (failure.locator || failure.endpoint) return '';
  const step = failure.failingStep;
  if (step && !step.startsWith(SPEC_LEVEL_STEP)) return ` @ ${step}`;
  const where = failure.component ?? failure.test.location;
  return ` @ ${step ?? '-'} @ ${where ? `${where.file}:${where.line}` : '-'}`;
}

/** The component most members point at. */
function mostCommon(refs: (SourceRef | null)[]): SourceRef | null {
  const counts = new Map<string, { ref: SourceRef; count: number }>();
  for (const ref of refs) {
    if (!ref) continue;
    const key = `${ref.file}:${ref.line}`;
    counts.set(key, { ref, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.ref ?? null;
}

/** Groups failures by category + cause, largest first. Ids (`C1`…) and history are set later. */
export function clusterFailures(failures: readonly Failure[]): Omit<Cluster, 'id' | 'history'>[] {
  const groups = new Map<string, [Failure, ...Failure[]]>();
  for (const failure of failures) {
    const key = `${failure.category} | ${causeOf(failure)}${anchorOf(failure)}`;
    const members = groups.get(key);
    if (members) members.push(failure);
    else groups.set(key, [failure]);
  }
  return [...groups.entries()]
    .map(([key, members]) => {
      members.sort((a, b) => a.test.fullName.localeCompare(b.test.fullName));
      const [first] = members;
      const { likely, hint } = LIKELY[first.category] ?? UNCLASSIFIED;
      return {
        key,
        title: `${first.category}: ${shortCause(first)}`,
        size: members.length,
        category: first.category,
        likely,
        hint,
        sharedRootCause: members.length >= ANALYSIS.sharedRootCauseMinTests,
        signature: first.signature,
        locator: first.locator,
        endpoint: first.endpoint,
        failingStep: first.failingStep,
        component: mostCommon(members.map((member) => member.component)),
        example: first.message,
        tests: members.map((member) => member.test),
      };
    })
    .sort(
      (a, b) =>
        b.size - a.size ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.key.localeCompare(b.key),
    );
}
