import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { locatorSegments, normalise, stringLiterals } from './signals';
import { type Endpoint, type SourceRef } from './types';
import { DOCUMENTED_ENDPOINTS, ENDPOINTS } from '../../src/config/constants';

/** The suite's own source (`src/**\/*.ts`), read once, to map a failure back to the line that causes it. */
export class SourceIndex {
  private readonly files: { file: string; lines: string[] }[];

  constructor(files: { file: string; text: string }[]) {
    this.files = files
      .map(({ file, text }) => ({ file, lines: text.split(/\r?\n/) }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  static read(root = '.'): SourceIndex {
    const files = readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts'))
      .map((file) => {
        const path = `src/${file.replace(/\\/g, '/')}`;
        return { file: path, text: readFileSync(join(root, path), 'utf8') };
      });
    return new SourceIndex(files);
  }

  /**
   * Where the locator is declared: the page-object file holding the most of the chain's literals
   * (`'#productsGrid'`, `'.card'`, `'.price'` → `ProductGrid.ts`), at the line of the deepest one. A
   * literal shared by several files (`'.card'`) cannot pull the match to the wrong one on its own.
   */
  findLocator(chain: string): SourceRef | null {
    const literals = new Set(locatorSegments(chain).flatMap(stringLiterals));
    let best: { ref: SourceRef; score: number } | null = null;
    for (const { file, lines } of this.files) {
      if (!file.startsWith('src/pages/')) continue;
      let score = 0;
      let line = 0;
      for (const literal of literals) {
        const index = lines.findIndex((text) => quotes(literal).some((q) => text.includes(q)));
        if (index < 0) continue;
        score++;
        // Literals run outermost → innermost, so the last one found is the deepest.
        line = index + 1;
      }
      if (score > (best?.score ?? 0)) best = { ref: { file, line }, score };
    }
    return best?.ref ?? null;
  }

  /**
   * Text values in a locator (`name:`, `hasText:`, `getByText(…)`): kept when a page object writes
   * them as literals (`'Place Order'`), else masked as `<text>` (an order number), so one broken
   * locator stays one cluster across tests and runs.
   */
  maskDynamicText(chain: string): string {
    return chain.replace(TEXT_VALUE, (whole, prefix: string, quoted: string) => {
      const literal = quoted.slice(1, -1);
      return literal === '<name>' || this.pagesWrite(literal) ? whole : `${prefix}'<text>'`;
    });
  }

  /**
   * The API-client line that makes the call: the `ENDPOINTS` entry the path matches (exactly, or
   * followed by an id), then the `src/api` line using it in the same form (`ENDPOINTS.x`, or
   * `${ENDPOINTS.x}/${id}`) with the same verb (`this.delete(`), looking a few lines up for a wrapped
   * call. `null` when the path matches no entry.
   */
  findEndpoint({ method, path }: Pick<Endpoint, 'method' | 'path'>): SourceRef | null {
    const entry = ENDPOINT_ENTRIES.filter(
      ({ value }) => path === value || path.startsWith(`${value}/:id`),
    ).sort((a, b) => b.value.length - a.value.length)[0];
    if (!entry) return null;
    const { object, key, value } = entry;
    const usage =
      path === value
        ? new RegExp(String.raw`(?<![\w.])${object}\.${key}\b(?!\}/)`)
        : new RegExp(String.raw`(?<![\w.])${object}\.${key}\}/`);
    const verb = new RegExp(String.raw`\bthis\.${method.toLowerCase()}\s*[<(]`);
    let sameForm: SourceRef | null = null;
    for (const { file, lines } of this.files) {
      if (!file.startsWith('src/api/')) continue;
      for (const [index, line] of lines.entries()) {
        if (!usage.test(line)) continue;
        const call = lines.slice(Math.max(0, index - WRAPPED_CALL_LINES), index + 1).join(' ');
        if (verb.test(call)) return { file, line: index + 1 };
        sameForm ??= { file, line: index + 1 };
      }
    }
    return sameForm;
  }

  /**
   * The page-object line whose `whileAwaitingApi(page, '<METHOD>', ENDPOINTS.x, …)` saw the failed
   * response: a UI action, not an API client. A wait covers its entry's path and every sub-path
   * (`/api/basket` covers `DELETE /api/basket/:id`), so the longest entry with a wait is used.
   *
   * Several page objects often wait on the same call (`GET /api/orders` from a tab and from a modal),
   * so the failing step decides: the wait whose `@step` title (or, inside an undecorated helper, the
   * titles of the decorated methods calling it) matches the outermost failing step. A single
   * candidate needs no match; an ambiguous one gives `null` rather than a guess.
   */
  findUiWait(
    { method, path }: Pick<Endpoint, 'method' | 'path'>,
    failingStep: string | null,
  ): SourceRef | null {
    const keys = Object.entries(ENDPOINTS)
      .filter(([, value]) => path === value || path.startsWith(`${value}/`))
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([key]) => key);
    for (const key of keys) {
      const usage = new RegExp(String.raw`(?<![\w.])ENDPOINTS\.${key}\b`);
      const candidates = this.files.flatMap(({ file, lines }) =>
        file.startsWith('src/pages/')
          ? lines.flatMap((line, index) =>
              line.includes('whileAwaitingApi(') && line.includes(`'${method}'`) && usage.test(line)
                ? [{ file, line: index + 1, titles: reachingTitles(lines, index) }]
                : [],
            )
          : [],
      );
      if (candidates.length === 0) continue;
      const outer = failingStep?.split(' > ')[0];
      const matching = outer
        ? candidates.filter(({ titles }) => titles.some((title) => title.test(outer)))
        : [];
      const pool = matching.length > 0 ? matching : candidates;
      const [only] = pool;
      return pool.length === 1 && only ? { file: only.file, line: only.line } : null;
    }
    return null;
  }

  /** `src/api/<Class>.ts` at its `class` line: names the client when the stack only shows `ApiClient`. */
  findClass(name: string): SourceRef | null {
    for (const { file, lines } of this.files) {
      const index = lines.findIndex((line) => new RegExp(String.raw`\bclass ${name}\b`).test(line));
      if (index >= 0) return { file, line: index + 1, symbol: name };
    }
    return null;
  }

  /** Whether any page object writes `literal` as a string literal. */
  private pagesWrite(literal: string): boolean {
    return this.files.some(
      ({ file, lines }) =>
        file.startsWith('src/pages/') &&
        lines.some((text) => quotes(literal).some((q) => text.includes(q))),
    );
  }
}

/** A call Prettier wrapped puts the verb up to this many lines above the path. */
const WRAPPED_CALL_LINES = 2;
/** A `@step(…)` decorator Prettier wrapped spans up to this many lines above its method. */
const DECORATOR_LINES = 4;

/** Both endpoint tables: the paths the UI calls and the documented ones the contract tests call. */
const ENDPOINT_ENTRIES = [
  ...Object.entries(ENDPOINTS).map(([key, value]) => ({ object: 'ENDPOINTS', key, value })),
  ...Object.entries(DOCUMENTED_ENDPOINTS).map(([key, value]) => ({
    object: 'DOCUMENTED_ENDPOINTS',
    key,
    value,
  })),
];

/** A text-valued locator argument: `name: '…'`, `hasText: '…'`, `getByText('…'`, etc. */
const TEXT_VALUE =
  /((?:\b(?:name|hasText|hasNotText):\s*|getBy(?:Text|Label|Placeholder|Title|AltText)\())('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;

/** A class member declaration at two-space indent: `async name(`, `private async name<T>(`. */
const METHOD =
  /^ {2}(?:(?:private|protected|public|static)\s+)*(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\(/;

interface Method {
  name: string;
  start: number;
  end: number;
  title: RegExp | null;
}

function methodsOf(lines: readonly string[]): Method[] {
  const starts = lines.flatMap((line, index) => {
    const name = METHOD.exec(line)?.[1];
    return name ? [{ name, start: index }] : [];
  });
  return starts.map(({ name, start }, i) => ({
    name,
    start,
    end: (starts[i + 1]?.start ?? lines.length) - 1,
    title: decoratorTitle(lines, start),
  }));
}

/** The `@step` title right above a method, as a matcher for a normalised step name. */
function decoratorTitle(lines: readonly string[], methodLine: number): RegExp | null {
  const above: string[] = [];
  for (let i = methodLine - 1; i >= Math.max(0, methodLine - DECORATOR_LINES); i--) {
    const text = (lines[i] ?? '').trim();
    if (text === '' || text === '}' || text.endsWith(';') || text.endsWith('*/')) break;
    above.unshift(text);
  }
  const decorator = above.join(' ');
  if (!decorator.includes('@step(')) return null;
  const template = /`([^`]*)`/.exec(decorator)?.[1];
  if (template !== undefined) return templateMatcher(template);
  const fixed = /@step\(\s*'((?:[^'\\]|\\.)*)'/.exec(decorator)?.[1];
  return fixed === undefined ? null : new RegExp(`^${escapeRegExp(normalise(fixed))}$`);
}

/**
 * A template hole matches any value. `normalise` trims each static part, so the hole also takes the
 * single spaces around it (`Filter by category ${category}`).
 */
const HOLE = ' ?.+? ?';

/** `Remove "${name}" from the basket` → `^Remove "<hole>" from the basket$`. */
function templateMatcher(template: string): RegExp {
  const parts: string[] = [];
  let text = '';
  for (let i = 0; i < template.length; i++) {
    if (template.startsWith('${', i)) {
      parts.push(escapeRegExp(normalise(text)), HOLE);
      text = '';
      let depth = 1;
      for (i += 2; i < template.length && depth > 0; i++) {
        if (template[i] === '{') depth++;
        else if (template[i] === '}') depth--;
      }
      i--;
    } else {
      text += template[i] ?? '';
    }
  }
  parts.push(escapeRegExp(normalise(text)));
  return new RegExp(`^${parts.join('')}$`);
}

/**
 * The step titles under which the wait on `line` runs: its method's own `@step`, or, for an
 * undecorated helper (`refetching`), the `@step` titles of the methods that call it.
 */
function reachingTitles(lines: readonly string[], line: number): RegExp[] {
  const methods = methodsOf(lines);
  const own = methods.filter((m) => m.start <= line).at(-1);
  if (!own) return [];
  if (own.title) return [own.title];
  return methods.flatMap((m) =>
    m.title && lines.slice(m.start, m.end + 1).some((text) => text.includes(`this.${own.name}(`))
      ? [m.title]
      : [],
  );
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const quotes = (literal: string): string[] => [`'${literal}'`, `"${literal}"`, `\`${literal}\``];
