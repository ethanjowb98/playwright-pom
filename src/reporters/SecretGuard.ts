import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ALLURE, AUTH, SECRET_GUARD } from '../config/constants';
import { env } from '../config/env';

import type {
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

/** Attachments worth scanning; screenshots and videos cannot carry typed text. */
const TEXT_CONTENT_TYPE = /^(text\/|application\/(json|xml))/;

interface Source {
  where: string;
  text: string;
}

/**
 * Fails the run if a secret (the account password or api key) reached what the reports show from the
 * test results: step titles and params (including Playwright's own `Fill "<value>"` steps), errors,
 * annotations, stdout/stderr, text attachments, and this run's allure-results files. Each secret is
 * also matched JSON-escaped and URL-encoded.
 *
 * Out of scope: binary attachments (screenshots, videos) and trace zips. Traces are off for that
 * reason (every request context, the seeder's included, would record the `Authorization` header).
 *
 * When it fires it writes the leak locations (never the secret) to `SECRET_GUARD.leakFile`; CI skips
 * the report upload while that file exists. Listed last in the reporters.
 */
export default class SecretGuard implements Reporter {
  private readonly leaks = new Set<string>();
  private startedAt = 0;
  private password: string | undefined;
  private apiKey: string | undefined;

  printsToStdio(): boolean {
    return false;
  }

  onBegin(): void {
    this.startedAt = Date.now();
    rmSync(SECRET_GUARD.leakFile, { force: true });
    this.password = readPassword();
    if (this.password !== undefined && this.password.length < SECRET_GUARD.minSecretLength) {
      process.stderr.write(
        `SecretGuard: the password is shorter than ${SECRET_GUARD.minSecretLength} characters and is not checked.\n`,
      );
    }
  }

  onError(error: TestError): void {
    this.check('global error', errorTexts(error));
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const name = test.titlePath().filter(Boolean).join(' › ');
    for (const { where, text } of resultSources(test, result))
      this.check(`${name}: ${where}`, [text]);
  }

  onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
    for (const file of allureFilesSince(this.startedAt)) {
      this.check(file, [readFileSync(file, 'utf8')]);
    }
    if (this.leaks.size === 0) return Promise.resolve(undefined);

    const locations = [...this.leaks].map((leak) => `  - ${leak}`).join('\n');
    writeFileSync(SECRET_GUARD.leakFile, `${locations}\n`);
    process.stderr.write(
      `\nSecretGuard: a secret appeared in ${this.leaks.size} place(s) the reports show. ` +
        `Do not upload or share playwright-report/, ${ALLURE.resultsDir}/ or test-results/:\n${locations}\n`,
    );
    return Promise.resolve({ status: 'failed' });
  }

  private check(where: string, texts: string[]): void {
    const needles = this.needles();
    if (texts.some((text) => needles.some((needle) => text.includes(needle)))) {
      this.leaks.add(where);
    }
  }

  /** Each secret as typed, JSON-escaped (allure .json files) and URL-encoded. */
  private needles(): string[] {
    this.apiKey ??= readApiKey();
    return [this.password, this.apiKey]
      .filter((secret): secret is string => (secret?.length ?? 0) >= SECRET_GUARD.minSecretLength)
      .flatMap((secret) => [
        secret,
        JSON.stringify(secret).slice(1, -1),
        encodeURIComponent(secret),
      ]);
  }
}

function readPassword(): string | undefined {
  try {
    return env.password;
  } catch {
    return undefined; // No password configured: nothing can leak it.
  }
}

/** The api key once the setup project has written it; `undefined` while missing or unreadable. */
function readApiKey(): string | undefined {
  try {
    return (JSON.parse(readFileSync(AUTH.apiKeyFile, 'utf8')) as { apiKey?: string }).apiKey;
  } catch {
    return undefined;
  }
}

function errorTexts(error: TestError): string[] {
  return [error.message, error.stack, error.value, error.snippet].filter(
    (text): text is string => text !== undefined,
  );
}

function resultSources(test: TestCase, result: TestResult): Source[] {
  const sources: Source[] = [];
  const walk = (steps: TestStep[]): void => {
    for (const step of steps) {
      sources.push({ where: `step "${step.category}"`, text: step.title });
      sources.push({
        where: `step "${step.category}" params`,
        text: JSON.stringify(step.params ?? {}),
      });
      if (step.error) {
        for (const text of errorTexts(step.error)) sources.push({ where: 'step error', text });
      }
      walk(step.steps);
    }
  };
  walk(result.steps);
  for (const error of result.errors) {
    for (const text of errorTexts(error)) sources.push({ where: 'error', text });
  }
  sources.push({
    where: 'annotations',
    text: JSON.stringify([...test.annotations, ...result.annotations]),
  });
  for (const chunk of [...result.stdout, ...result.stderr]) {
    sources.push({ where: 'stdout/stderr', text: chunk.toString() });
  }
  for (const attachment of result.attachments) {
    if (!TEXT_CONTENT_TYPE.test(attachment.contentType)) continue;
    const text =
      attachment.body?.toString() ??
      (attachment.path && existsSync(attachment.path) ? readFileSync(attachment.path, 'utf8') : '');
    sources.push({ where: `attachment "${attachment.name}"`, text });
  }
  return sources;
}

/** allure-results is never cleaned between runs, so only this run's files are scanned. */
function allureFilesSince(startedAt: number): string[] {
  if (!existsSync(ALLURE.resultsDir)) return [];
  return readdirSync(ALLURE.resultsDir)
    .filter((file) => /\.(json|txt|xml)$/.test(file))
    .map((file) => join(ALLURE.resultsDir, file))
    .filter((file) => statSync(file).mtimeMs >= startedAt);
}
