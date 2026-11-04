/**
 * The GitHub Pages report site on the `gh-pages` branch (CI only, see .github/workflows/playwright.yml):
 *  - `restore --site <dir>` copies the Allure history and the last failure analysis into the repo root,
 *    so the trend charts and new-vs-recurring cover earlier runs.
 *  - `publish --site <dir>` adds this run's Allure report, saves the history back, keeps the newest
 *    `ALLURE.historyLimit` reports and rewrites the index page.
 * The workflow commits and pushes the site; this script only changes files.
 */
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
  const runs = publishRun({
    site,
    report: ALLURE.reportDir,
    workDir: '.',
    keep: ALLURE.historyLimit,
    entry: {
      id: `${githubEnv('GITHUB_RUN_NUMBER')}-${githubEnv('GITHUB_RUN_ATTEMPT')}`,
      publishedAt: new Date().toISOString(),
      branch: githubEnv('GITHUB_REF_NAME'),
      commit: githubEnv('GITHUB_SHA'),
      event: githubEnv('GITHUB_EVENT_NAME'),
      runUrl: `${repoUrl}/actions/runs/${githubEnv('GITHUB_RUN_ID')}`,
    },
  });
  process.stdout.write(`Published run ${runs[0]?.id ?? '?'}; ${runs.length} reports kept.\n`);
} else {
  process.stderr.write('Usage: report-site <restore|publish> [--site <dir>]\n');
  process.exitCode = 1;
}
