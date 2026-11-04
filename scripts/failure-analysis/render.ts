import { endpointText, shortCause } from './cluster';
import { type Analysis, type Cluster, type SourceRef, type TestRef } from './types';

// Fixed format: the failure-triager agent reads these headings and columns (the CI summary will in M7).

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** An inline code span; backticks inside become quotes so the span cannot break. */
const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;
const ref = (source: SourceRef | null): string =>
  source ? `${source.file}:${source.line}${source.symbol ? ` (${source.symbol})` : ''}` : '—';
const where = (test: TestRef): string =>
  test.location ? `${test.location.file}:${test.location.line}` : test.fullName;
const tests = (count: number): string => `${count} ${count === 1 ? 'test' : 'tests'}`;

/** A fence longer than any backtick run in the text, so an error quoting Markdown cannot close it. */
function fenced(text: string): string[] {
  const longestRun = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return [`${fence}text`, text, fence];
}

function testLine(test: TestRef): string {
  const repetition = test.repetition === null ? '' : ` (repetition ${test.repetition})`;
  const attempts = test.attempts > 1 ? ` (${test.attempts} attempts)` : '';
  return `  - ${code(where(test))} ${test.name} [${test.project}]${repetition}${attempts}`;
}

function clusterSection(cluster: Cluster): string {
  const shared = cluster.sharedRootCause
    ? `likely shared root cause (${tests(cluster.size)})`
    : 'single test';
  return [
    `### ${cluster.id} · ${cluster.category}: ${code(shortCause(cluster))}`,
    '',
    `- **Likely:** ${cluster.likely}, ${shared}, ${cluster.history}`,
    `- **Hint:** ${cluster.hint}`,
    `- **Component:** ${cluster.component ? code(ref(cluster.component)) : '—'}`,
    `- **Endpoint:** ${cluster.endpoint ? code(endpointText(cluster.endpoint)) : '—'}`,
    `- **Locator:** ${cluster.locator ? code(cluster.locator) : '—'}`,
    `- **Failing step:** ${cluster.failingStep ? code(cluster.failingStep) : '—'}`,
    `- **Signature:** ${code(cluster.signature)}`,
    '- **Tests:**',
    ...cluster.tests.map(testLine),
    '',
    ...fenced(cluster.example.trimEnd()),
  ].join('\n');
}

export function renderMarkdown(analysis: Analysis): string {
  const { summary, run } = analysis;
  const passed =
    summary.flaky > 0
      ? `${summary.passed} passed (${summary.flaky} after a retry)`
      : `${summary.passed} passed`;
  const out: string[] = [
    '# Failure analysis',
    '',
    `Run ${code(run.id)} · generated ${analysis.generatedAt} · compared with ${analysis.previousRunId ? code(analysis.previousRunId) : 'no previous run'}`,
    '',
    `**${tests(summary.tests)}:** ${passed} · ${summary.failed} failed · ${summary.skipped} skipped (${summary.knownDefects} known product defects) · ${summary.clusters} clusters`,
    '',
    '## Clusters',
    '',
  ];

  if (analysis.clusters.length === 0) {
    out.push('No failures.', '');
  } else {
    out.push(
      '| #   | Tests | Category | Likely | Cause | Component | History |',
      '| --- | ----- | -------- | ------ | ----- | --------- | ------- |',
      ...analysis.clusters.map(
        (c) =>
          `| ${c.id} | ${c.size} | ${cell(c.category)} | ${c.likely} | ${cell(code(shortCause(c)))} | ${cell(ref(c.component))} | ${c.history} |`,
      ),
      '',
      ...analysis.clusters.flatMap((cluster) => [clusterSection(cluster), '']),
    );
  }

  out.push('## Flaky (passed on retry)', '');
  out.push(
    ...(analysis.flaky.length === 0
      ? ['None.']
      : analysis.flaky.map(
          (f) =>
            `- ${code(where(f.test))} ${f.test.name} [${f.test.project}]: ${f.category}, ${code(f.firstError)}`,
        )),
    '',
  );

  out.push('## Known product defects (skipped)', '');
  out.push(
    ...(analysis.knownDefects.length === 0
      ? ['None.']
      : analysis.knownDefects.map(
          (d) => `- **${d.test.feature ?? 'Unlabelled'}:** ${d.reason} (${d.test.name})`,
        )),
    '',
  );

  out.push('## Resolved since the previous run', '');
  out.push(
    ...(analysis.resolved.length === 0
      ? ['None.']
      : analysis.resolved.map((r) => `- ${r.title} (${tests(r.size)})`)),
    '',
  );
  return out.join('\n');
}
