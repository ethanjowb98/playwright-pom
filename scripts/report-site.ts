/**
 * The GitHub Pages report site on the `gh-pages` branch (CI only, see .github/workflows/playwright.yml):
 *  - `restore --site <dir>` copies the Allure history and the last failure analysis into the repo root,
 *    so the trend charts and new-vs-recurring cover earlier runs.
 *  - `publish --site <dir>` adds this run's Allure report, saves the history back, keeps the newest
 *    `ALLURE.historyLimit` reports and rewrites the index page.
 * The workflow commits and pushes the site; this script only changes files.
 */
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { publishRun, restoreHistory } from './report-site/site';
import { ALLURE } from '../src/config/constants';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { site: { type: 'string', default: 'gh-pages' } },
});
const [command] = positionals;
const site = values.site;

function githubEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`report-site: ${name} is not set (publish runs in GitHub Actions only).`);
  return value;
}

if (command === 'restore') {
  const restored = restoreHistory(site, '.');
  process.stdout.write(
    restored.length > 0
      ? `Restored ${restored.join(', ')} from ${site}.\n`
      : `No history in ${site} yet: this run starts it.\n`,
  );
} else if (command === 'publish') {
  const repoUrl = `${githubEnv('GITHUB_SERVER_URL')}/${githubEnv('GITHUB_REPOSITORY')}`;
  const id = `${githubEnv('GITHUB_RUN_NUMBER')}-${githubEnv('GITHUB_RUN_ATTEMPT')}`;
  const runs = publishRun({
    site,
    report: ALLURE.reportDir,
    workDir: '.',
    keep: ALLURE.historyLimit,
    entry: {
      id,
      publishedAt: new Date().toISOString(),
      branch: githubEnv('GITHUB_REF_NAME'),
      commit: githubEnv('GITHUB_SHA'),
      event: githubEnv('GITHUB_EVENT_NAME'),
      suite: process.env.SUITE || 'all',
      runUrl: `${repoUrl}/actions/runs/${githubEnv('GITHUB_RUN_ID')}`,
    },
  });
  // A re-run of an old run can sort outside the newest reports and be dropped in the same publish.
  const kept = runs.some((run) => run.id === id);
  process.stdout.write(
    kept
      ? `Published run ${id}; ${runs.length} reports kept.\n`
      : `Run ${id} is older than the newest ${runs.length} reports, so it is not kept.\n`,
  );
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `kept=${kept}\n`);
} else {
  process.stderr.write('Usage: report-site <restore|publish> [--site <dir>]\n');
  process.exitCode = 1;
}
