import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { release, type } from 'node:os';
import { join } from 'node:path';

import { ALLURE } from '../config/constants';
import { env } from '../config/env';

import type { FullConfig, Reporter } from '@playwright/test/reporter';

/** Allure's `executor.json`: who ran the build, shown in the report header and overview. */
interface Executor {
  name: string;
  type: string;
  url?: string;
  buildOrder?: number;
  buildName: string;
  buildUrl?: string;
}

/**
 * Prepares `allure-results/` for a run: clears the previous run's results, so the report shows this run
 * only (like the HTML report), then writes `environment.properties` and `executor.json`. Categories are
 * written by allure-playwright (`categories` option). Listed before allure-playwright.
 *
 * Never put a credential here: environment.properties is shown on the report overview.
 */
export default class AllureRunInfo implements Reporter {
  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig): void {
    rmSync(ALLURE.resultsDir, { recursive: true, force: true });
    mkdirSync(ALLURE.resultsDir, { recursive: true });
    writeFileSync(
      join(ALLURE.resultsDir, 'environment.properties'),
      properties(environment(config)),
    );
    writeFileSync(join(ALLURE.resultsDir, 'executor.json'), JSON.stringify(executor(), null, 2));
  }
}

function environment(config: FullConfig): Record<string, string> {
  const projects = config.projects.map((project) => project.name);
  const browsers = new Set(
    config.projects.flatMap((project) => project.use.defaultBrowserType ?? []),
  );
  return {
    'Base URL': env.baseURL,
    Playwright: config.version,
    Browsers: [...browsers].join(', '),
    Projects: projects.join(', '),
    Workers: String(config.workers),
    Shard: config.shard ? `${config.shard.current}/${config.shard.total}` : 'none',
    Node: process.version,
    OS: `${type()} ${release()}`,
    CI: env.isCI ? 'true' : 'false',
  };
}

/** GitHub Actions when running there, otherwise a local run. */
function executor(): Executor {
  const { GITHUB_ACTIONS, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_NUMBER } =
    process.env;
  if (GITHUB_ACTIONS && GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID) {
    const repoUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`;
    return {
      name: 'GitHub Actions',
      type: 'github',
      url: `${repoUrl}/actions`,
      buildOrder: Number(GITHUB_RUN_NUMBER),
      buildName: `${process.env.GITHUB_WORKFLOW ?? 'CI'} #${GITHUB_RUN_NUMBER ?? GITHUB_RUN_ID}`,
      buildUrl: `${repoUrl}/actions/runs/${GITHUB_RUN_ID}`,
    };
  }
  return { name: 'Local', type: 'local', buildName: `Local run ${new Date().toISOString()}` };
}

/** Java `.properties`: `\`, `=`, `:` and spaces in keys are escaped; values only need `\`. */
function properties(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([key, value]) => {
      const escapedKey = key.replace(/[\\=: ]/g, (char) => `\\${char}`);
      return `${escapedKey}=${value.replace(/\\/g, '\\\\')}\n`;
    })
    .join('');
}
