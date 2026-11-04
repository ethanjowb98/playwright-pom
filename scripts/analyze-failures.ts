/**
 * Rule-based failure analysis (`npm run analyze [-- --results <dir>]`): reads one run's allure-results,
 * clusters the failures by shared cause, and writes `failure-analysis.md` + `failure-analysis.json`.
 * Deterministic and offline: no LLM, no network. See docs/ARCHITECTURE.md#failure-analysis.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { analyze } from './failure-analysis/analyze';
import { previousAnalysis } from './failure-analysis/baseline';
import { loadRun } from './failure-analysis/load';
import { renderMarkdown } from './failure-analysis/render';
import { SourceIndex } from './failure-analysis/source';
import { ALLURE, ANALYSIS, AUTH, SECRET_GUARD } from '../src/config/constants';
import { readApiKey, readPassword, secretNeedles } from '../src/utils/secrets';

const warn = (message: string): void => {
  process.stderr.write(`analyze: ${message}\n`);
};

const { values } = parseArgs({
  options: { results: { type: 'string', default: ALLURE.resultsDir } },
});
const resultsDir = values.results;

const password = readPassword();
const apiKey = readApiKey();
if (password === undefined) warn('QACLOUD_PASSWORD is not set, so it cannot be masked.');
else if (password.length < SECRET_GUARD.minSecretLength) {
  warn(
    `QACLOUD_PASSWORD is shorter than ${SECRET_GUARD.minSecretLength} characters and is not masked.`,
  );
}
if (apiKey === undefined) warn(`${AUTH.apiKeyFile} is missing, so the api key cannot be masked.`);

const run = loadRun(resultsDir);
for (const file of run.unreadable) warn(`skipped unreadable result ${file}`);

const analysis = analyze(run, {
  resultsDir,
  sources: SourceIndex.read(),
  needles: secretNeedles([password, apiKey]),
  baseline: previousAnalysis({
    id: run.id,
    start: run.start === null ? null : new Date(run.start).toISOString(),
  }),
  cwd: process.cwd(),
});

writeFileSync(ANALYSIS.jsonFile, `${JSON.stringify(analysis, null, 2)}\n`);
writeFileSync(ANALYSIS.markdownFile, renderMarkdown(analysis));

const { summary } = analysis;
process.stdout.write(
  `${summary.tests} tests, ${summary.failed} failed, ${summary.flaky} flaky → ${summary.clusters} clusters. ` +
    `Wrote ${ANALYSIS.markdownFile} and ${ANALYSIS.jsonFile}.\n`,
);
for (const cluster of analysis.clusters) {
  process.stdout.write(`  ${cluster.id} (${cluster.size}) ${cluster.title} [${cluster.history}]\n`);
}
