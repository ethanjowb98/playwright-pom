import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  escapeHtml,
  publishRun,
  renderIndex,
  renderRedirect,
  restoreHistory,
  type RunEntry,
} from './site';
import { ALLURE, ANALYSIS, REPORT_SITE } from '../../src/config/constants';

const tempDirs: string[] = [];
/** A fresh folder under the OS temp dir, removed when the tests finish. */
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'report-site-'));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const SUMMARY = {
  tests: 10,
  passed: 8,
  failed: 1,
  flaky: 1,
  skipped: 0,
  knownDefects: 0,
  clusters: 1,
};

interface WorkDirFiles {
  /** `failure-analysis.json` (default true). */
  analysis?: boolean;
  /** `failure-analysis.previous.json` (default false). */
  previous?: boolean;
}

/** A repo root after `allure generate` and `npm run analyze`. */
function workDir(marker: string, { analysis = true, previous = false }: WorkDirFiles): string {
  const dir = tempDir();
  mkdirSync(join(dir, ALLURE.reportDir));
  writeFileSync(join(dir, ALLURE.reportDir, 'index.html'), marker);
  writeFileSync(join(dir, ALLURE.historyFile), `{"run":"${marker}"}\n`);
  if (analysis) writeFileSync(join(dir, ANALYSIS.jsonFile), JSON.stringify({ summary: SUMMARY }));
  if (previous) writeFileSync(join(dir, ANALYSIS.previousFile), `{"run":"before ${marker}"}`);
  return dir;
}

function publish(site: string, id: string, files: WorkDirFiles = {}): RunEntry[] {
  const dir = workDir(id, files);
  return publishRun({
    site,
    report: join(dir, ALLURE.reportDir),
    workDir: dir,
    keep: 3,
    entry: {
      id,
      publishedAt: '2026-11-04T10:00:00.000Z',
      branch: 'main',
      commit: 'abcdef1234567',
      event: 'push',
      suite: 'all',
      runUrl: 'https://github.com/o/r/actions/runs/1',
    },
  });
}

describe('report site', () => {
  it('should restore nothing when the site has no history yet', () => {
    assert.deepEqual(restoreHistory(tempDir(), tempDir()), []);
  });

  it('should restore every history file when a run published them', () => {
    const site = tempDir();
    publish(site, '1-1', { previous: true });
    const repo = tempDir();
    assert.deepEqual(restoreHistory(site, repo), [
      ALLURE.historyFile,
      ANALYSIS.jsonFile,
      ANALYSIS.previousFile,
    ]);
    assert.equal(readFileSync(join(repo, ALLURE.historyFile), 'utf8'), '{"run":"1-1"}\n');
    assert.equal(readFileSync(join(repo, ANALYSIS.previousFile), 'utf8'), '{"run":"before 1-1"}');
  });

  it('should list the run without results when the analysis did not run', () => {
    const [run] = publish(tempDir(), '1-1', { analysis: false });
    assert.equal(run?.summary, null);
  });

  it('should keep every report when the manifest is corrupt', () => {
    const site = tempDir();
    publish(site, '1-1');
    publish(site, '2-1');
    writeFileSync(join(site, REPORT_SITE.manifestFile), '{ not json');
    const runs = publish(site, '3-1');
    assert.deepEqual(
      runs.map((run) => run.id),
      ['3-1', '2-1', '1-1'],
    );
    assert.deepEqual(readdirSync(join(site, REPORT_SITE.runsDir)).sort(), ['1-1', '2-1', '3-1']);
    assert.equal(runs[1]?.branch, 'unknown');
  });

  it('should keep the newest reports when more runs than the limit are published', () => {
    const site = tempDir();
    for (const id of ['8-1', '9-1', '10-1', '10-2']) publish(site, id);
    assert.deepEqual(readdirSync(join(site, REPORT_SITE.runsDir)).sort(), ['10-1', '10-2', '9-1']);
    const manifest = JSON.parse(
      readFileSync(join(site, REPORT_SITE.manifestFile), 'utf8'),
    ) as RunEntry[];
    assert.deepEqual(
      manifest.map((run) => run.id),
      ['10-2', '10-1', '9-1'],
    );
    assert.deepEqual(manifest[0]?.summary, SUMMARY);
  });

  it('should replace the report when the same run attempt is published again', () => {
    const site = tempDir();
    publish(site, '5-1');
    const runs = publish(site, '5-1');
    assert.equal(runs.length, 1);
    assert.equal(readFileSync(join(site, REPORT_SITE.runsDir, '5-1', 'index.html'), 'utf8'), '5-1');
  });

  it('should point latest at the newest run when several are published', () => {
    const site = tempDir();
    publish(site, '2-1');
    publish(site, '3-1');
    assert.match(
      readFileSync(join(site, REPORT_SITE.latestDir, 'index.html'), 'utf8'),
      /url=\.\.\/runs\/3-1\//,
    );
  });

  it('should point latest at the site root when no run is published', () => {
    assert.match(renderRedirect(undefined), /url=\.\.\/"/);
  });

  it('should disable Jekyll when the site is written', () => {
    const site = tempDir();
    publish(site, '1-1');
    assert.ok(existsSync(join(site, '.nojekyll')));
  });

  it('should escape branch names when it renders the index', () => {
    const html = renderIndex([
      {
        id: '1-1',
        publishedAt: '2026-11-04T10:00:00.000Z',
        branch: '<script>x</script>',
        commit: 'abc',
        event: 'push',
        suite: 'all',
        runUrl: 'https://example.test',
        summary: null,
      },
    ]);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes(escapeHtml('<script>x</script>')));
  });

  it('should show the suite when a partial run is listed', () => {
    const html = renderIndex([
      {
        id: '7-1',
        publishedAt: '2026-11-04T10:00:00.000Z',
        branch: 'feat/x',
        commit: 'abc',
        event: 'workflow_dispatch',
        suite: 'smoke',
        runUrl: 'https://example.test',
        summary: null,
      },
    ]);
    assert.ok(html.includes('<td>smoke</td>'));
  });
});
