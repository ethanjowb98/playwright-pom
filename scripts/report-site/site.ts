import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { ALLURE, ANALYSIS, REPORT_SITE } from '../../src/config/constants';
import { type Analysis } from '../failure-analysis/types';

/** Files carried from run to run: the Allure trend history and the failure-analysis baseline. */
export const HISTORY_FILES = [ALLURE.historyFile, ANALYSIS.jsonFile, ANALYSIS.previousFile];

/** One published report, as listed on the index page. */
export interface RunEntry {
  /** `<run number>-<attempt>`, also the folder under `runs/`. */
  id: string;
  publishedAt: string;
  branch: string;
  commit: string;
  event: string;
  /** The `suite` the run tested (all, api, e2e, smoke): partial runs read differently from full ones. */
  suite: string;
  /** The GitHub Actions run. */
  runUrl: string;
  /** From `failure-analysis.json`; `null` when the analysis did not run. */
  summary: Analysis['summary'] | null;
}

export interface PublishOptions {
  /** The checked-out `gh-pages` branch. */
  site: string;
  /** The generated Allure report. */
  report: string;
  /** Where the history files are (the repo root in CI). */
  workDir: string;
  entry: Omit<RunEntry, 'summary'>;
  /** Reports kept; older ones are deleted. */
  keep: number;
}

/** Copies the history files the site has into `workDir`, before the analysis and the report run. */
export function restoreHistory(site: string, workDir: string): string[] {
  const restored = HISTORY_FILES.filter((file) =>
    existsSync(join(site, REPORT_SITE.historyDir, file)),
  );
  for (const file of restored)
    cpSync(join(site, REPORT_SITE.historyDir, file), join(workDir, file));
  return restored;
}

/** Newest first: run number, then attempt, compared as numbers. */
const newestFirst = (a: RunEntry, b: RunEntry): number =>
  b.id.localeCompare(a.id, 'en', { numeric: true });

/** A run known only from its folder: the manifest that described it was unreadable. */
const UNKNOWN = 'unknown';
const folderEntry = (id: string): RunEntry => ({
  id,
  publishedAt: UNKNOWN,
  branch: UNKNOWN,
  commit: UNKNOWN,
  event: UNKNOWN,
  suite: UNKNOWN,
  runUrl: '',
  summary: null,
});

/**
 * The published runs. An unreadable manifest is rebuilt from the `runs/` folders, so a corrupt
 * `runs.json` costs the index its details, never the reports themselves.
 */
function readManifest(site: string): RunEntry[] {
  const path = join(site, REPORT_SITE.manifestFile);
  if (!existsSync(path)) return [];
  try {
    const entries = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (Array.isArray(entries)) return entries as RunEntry[];
  } catch {
    // Rebuilt below.
  }
  const runsDir = join(site, REPORT_SITE.runsDir);
  return existsSync(runsDir) ? readdirSync(runsDir).map(folderEntry) : [];
}

function readSummary(workDir: string): RunEntry['summary'] {
  const path = join(workDir, ANALYSIS.jsonFile);
  if (!existsSync(path)) return null;
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as Analysis).summary;
  } catch {
    return null;
  }
}

/**
 * Adds this run's report under `runs/<id>/`, saves the history files, keeps the newest `keep` reports
 * (deleting the rest, and any folder the manifest does not list), and rewrites the index page and the
 * `latest/` redirect. Returns the runs kept, newest first.
 */
export function publishRun({ site, report, workDir, entry, keep }: PublishOptions): RunEntry[] {
  const runsDir = join(site, REPORT_SITE.runsDir);
  const runDir = join(runsDir, entry.id);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runsDir, { recursive: true });
  cpSync(report, runDir, { recursive: true });

  const historyDir = join(site, REPORT_SITE.historyDir);
  mkdirSync(historyDir, { recursive: true });
  for (const file of HISTORY_FILES) {
    if (existsSync(join(workDir, file))) cpSync(join(workDir, file), join(historyDir, file));
  }

  const runs = [
    { ...entry, summary: readSummary(workDir) },
    ...readManifest(site).filter((run) => run.id !== entry.id),
  ]
    .sort(newestFirst)
    .slice(0, keep);
  const kept = new Set(runs.map((run) => run.id));
  for (const dir of readdirSync(runsDir)) {
    if (!kept.has(dir)) rmSync(join(runsDir, dir), { recursive: true, force: true });
  }

  writeFileSync(join(site, REPORT_SITE.manifestFile), `${JSON.stringify(runs, null, 2)}\n`);
  writeFileSync(join(site, 'index.html'), renderIndex(runs));
  mkdirSync(join(site, REPORT_SITE.latestDir), { recursive: true });
  writeFileSync(join(site, REPORT_SITE.latestDir, 'index.html'), renderRedirect(runs[0]?.id));
  // Serve the files as they are: Jekyll would drop Allure's `_`-prefixed assets.
  writeFileSync(join(site, '.nojekyll'), '');
  return runs;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

function resultCell(summary: RunEntry['summary']): string {
  if (summary === null) return 'no analysis';
  const { passed, failed, flaky, skipped } = summary;
  const icon = failed > 0 ? '❌' : '✅';
  return `${icon} ${passed} passed · ${failed} failed · ${flaky} flaky · ${skipped} skipped`;
}

function renderRow(run: RunEntry): string {
  const id = escapeHtml(run.id);
  const published =
    run.publishedAt === UNKNOWN ? UNKNOWN : `${run.publishedAt.replace('T', ' ').slice(0, 16)} UTC`;
  return [
    '<tr>',
    `<td><a href="${REPORT_SITE.runsDir}/${id}/">#${id}</a></td>`,
    `<td>${escapeHtml(published)}</td>`,
    `<td>${escapeHtml(run.branch)} <code>${escapeHtml(run.commit.slice(0, 7))}</code></td>`,
    `<td>${escapeHtml(run.event)}</td>`,
    `<td>${escapeHtml(run.suite)}</td>`,
    `<td>${escapeHtml(resultCell(run.summary))}</td>`,
    `<td>${run.runUrl ? `<a href="${escapeHtml(run.runUrl)}">workflow run</a>` : ''}</td>`,
    '</tr>',
  ].join('');
}

export function renderIndex(runs: readonly RunEntry[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Market test reports</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 2rem auto; max-width: 64rem; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #8884; }
</style>
</head>
<body>
<h1>Market test reports</h1>
<p><a href="${REPORT_SITE.latestDir}/">Latest report</a> · the last ${runs.length} published runs, newest first.</p>
<table>
<thead><tr><th>Run</th><th>Published</th><th>Branch</th><th>Event</th><th>Suite</th><th>Result</th><th></th></tr></thead>
<tbody>
${runs.map(renderRow).join('\n')}
</tbody>
</table>
</body>
</html>
`;
}

export function renderRedirect(id: string | undefined): string {
  const target = id === undefined ? '../' : `../${REPORT_SITE.runsDir}/${escapeHtml(id)}/`;
  return `<!doctype html>
<meta charset="utf-8">
<title>Latest Market test report</title>
<meta http-equiv="refresh" content="0; url=${target}">
<a href="${target}">Latest report</a>
`;
}
