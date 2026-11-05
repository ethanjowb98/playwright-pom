import {
  type AllureStatus,
  type AllureStep,
  type Endpoint,
  isFailure,
  type SourceRef,
} from './types';
import { ALLURE_CATEGORIES } from '../../src/config/allureCategories';
import { ANALYSIS, TEST_DATA } from '../../src/config/constants';

// Pure text extraction from one failed attempt: no file access, so it is unit-tested directly.

/** `QA-<worker>-<id>` from `uniqueName` (worker `x` outside a test worker). */
const NAME_ID = `${TEST_DATA.namePrefix}-(?:\\d+|x)-[a-z0-9]{${TEST_DATA.idLength}}`;
/** A quoted name: the random label after the id is masked up to the same closing quote. */
const QUOTED_NAME = new RegExp(`(['"\`])${NAME_ID}[^\\n]*?(?=\\1)`, 'g');
/** An unquoted name: only the id is masked, so the rest of the line is kept. */
const BARE_NAME = new RegExp(`${NAME_ID}\\b`, 'g');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Replaces per-test data (generated names, ids), so the same cause reads the same in every test. */
export function maskTestData(text: string): string {
  return text.replace(QUOTED_NAME, '$1<name>').replace(BARE_NAME, '<name>').replace(UUID, ':id');
}

/** `maskTestData` plus numbers and whitespace: two errors with one cause get one signature. */
export function normalise(text: string): string {
  return (
    maskTestData(text)
      // Not after a letter: `5000ms` → `Nms`, `$31.41` → `$N`, but `h2` stays.
      .replace(/(?<![A-Za-z\d])\d+(?:\.\d+)?/g, 'N')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** The first non-empty line of the error, normalised. */
export function signature(message: string): string {
  const first = message.split('\n').find((line) => line.trim() !== '') ?? '';
  return normalise(first).slice(0, ANALYSIS.signatureLength);
}

/** First match wins, as in the Allure report; unmatched failures land in Allure's built-in groups. */
export function categorise(status: AllureStatus, message: string, trace: string): string {
  for (const category of ALLURE_CATEGORIES) {
    if (!(category.matchedStatuses as readonly string[]).includes(status)) continue;
    if (category.messageRegex && !new RegExp(category.messageRegex).test(message)) continue;
    if (category.traceRegex && !new RegExp(category.traceRegex).test(trace)) continue;
    return category.name;
  }
  return status === 'broken' ? 'Test errors' : 'Product errors';
}

/** Expect errors print `Locator: …`; actions print the locator in the call log. */
const LOCATOR_PATTERNS = [
  /^Locator: (.+)$/m,
  /strict mode violation: (.+?) resolved to \d+ elements/,
  /waiting for ((?:locator|getBy\w+|frameLocator)\(.+?)(?: to be \w+)?$/m,
];

/** The locator chain named by the error, test data masked; `null` for non-UI failures. */
export function extractLocator(message: string): string | null {
  for (const pattern of LOCATOR_PATTERNS) {
    const match = pattern.exec(message);
    if (match?.[1]) return maskTestData(match[1].trim());
  }
  return null;
}

/** Splits `locator('#a').filter({ has: getByRole('b') }).locator('.c')` at top-level dots. */
export function locatorSegments(chain: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < chain.length; i++) {
    const char = chain.charAt(i);
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('({['.includes(char)) depth++;
    else if (')}]'.includes(char)) depth--;
    else if (char === '.' && depth === 0) {
      segments.push(chain.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(chain.slice(start));
  return segments.filter((segment) => segment !== '');
}

/** String literals in a locator segment, in order; masked test data and text are skipped. */
export function stringLiterals(segment: string): string[] {
  return [...segment.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((literal) => literal !== '' && literal !== '<text>' && !literal.includes('<name>'));
}

/** `ApiError` and `whileAwaitingApi` share `<METHOD> <path> returned <status>: <body>`. */
// Path and query are disjoint (`?` ends the path), so a long token cannot backtrack quadratically.
const API_CALL = /\b(GET|POST|PUT|PATCH|DELETE) (\/[^\s?]*)(?:\?\S*)? returned (\d{3})\b/;

/** `/api/products/<uuid>` → `/api/products/:id`; query strings dropped. */
export function normalisePath(path: string): string {
  return (path.split('?')[0] ?? path).replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
}

/** The failing API call named by the error message; `null` when the failure is not an API error. */
export function extractEndpoint(message: string): Endpoint | null {
  const match = API_CALL.exec(message);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { method: match[1], path: normalisePath(match[2]), status: Number(match[3]) };
}

/**
 * The first failed step at each level, outermost first: the page-object intent, then its action when the
 * results include Playwright's action steps (allure `detail: true`; this suite runs with `detail: false`).
 */
export function failingStepPath(steps: readonly AllureStep[]): string | null {
  const path: string[] = [];
  let level: readonly AllureStep[] | undefined = steps;
  for (;;) {
    const failed: AllureStep | undefined = level?.find((step) =>
      isFailure(step.status ?? 'unknown'),
    );
    if (!failed) break;
    path.push(failed.name);
    level = failed.steps;
  }
  return path.length > 0 ? normalise(path.join(' > ')) : null;
}

/** `at [async |new ]Symbol (location)` or `at location`; one line at a time, so long diffs stay linear. */
const FRAME_LINE = /^\s*at (?:(?:async |new )?([^\s(]+)(?: \[as [^\]]+\])? \()?(.*?)\)?$/;
const LINE_COLUMN = /:(\d+):\d+$/;

/**
 * The repo-relative file of a frame location: from the last `src/` or `tests/` segment, so an
 * absolute path with such a segment earlier on (another machine's checkout) is still read right.
 * String search, not a regex, so a long location cannot backtrack.
 */
function repoFile(path: string): { file: string; root: 'src' | 'tests' } | null {
  const posix = `/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
  const src = posix.lastIndexOf('/src/');
  const tests = posix.lastIndexOf('/tests/');
  if (src < 0 && tests < 0) return null;
  const root = src > tests ? 'src' : 'tests';
  return { file: posix.slice(Math.max(src, tests) + 1), root };
}

function frames(trace: string): (SourceRef & { root: 'src' | 'tests' })[] {
  return trace.split('\n').flatMap((text) => {
    if (!text.trimStart().startsWith('at ')) return [];
    const frame = FRAME_LINE.exec(text);
    const location = frame?.[2] ?? '';
    if (location.includes('node_modules')) return [];
    const lineColumn = LINE_COLUMN.exec(location);
    const repo = lineColumn ? repoFile(location.slice(0, lineColumn.index)) : null;
    if (!lineColumn || !repo) return [];
    return [
      {
        file: repo.file,
        line: Number(lineColumn[1]),
        ...(frame?.[1] ? { symbol: frame[1] } : {}),
        root: repo.root,
      },
    ];
  });
}

/** The spec line the failure surfaced at (boxed `@step` failures point there too). */
export function specLocation(trace: string): SourceRef | null {
  const frame = frames(trace).find((f) => f.root === 'tests');
  return frame ? { file: frame.file, line: frame.line } : null;
}

/** The innermost suite frame (`src/`), e.g. `ProductsApi.send` in `src/api/ApiClient.ts`. */
export function sourceFrame(trace: string): SourceRef | null {
  const frame = frames(trace).find((f) => f.root === 'src');
  if (!frame) return null;
  return { file: frame.file, line: frame.line, ...(frame.symbol ? { symbol: frame.symbol } : {}) };
}
