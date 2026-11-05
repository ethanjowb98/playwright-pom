import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ALLURE, SECRET_GUARD } from '../config/constants';
import { readApiKey, readPassword, readSessionCookies, secretNeedles } from '../utils/secrets';

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
/** allure-results files that cannot carry text: everything else there is scanned. */
const BINARY_FILE = /\.(png|jpe?g|gif|webm|mp4|zip)$/i;
/** A failed Playwright request lists every request header (the api key) after this line. */
const CALL_LOG = /\n\s*Call log:/;

/**
 * `callLog`: only in the call log of a failed Playwright step, which the HTML report shows and Allure
 * (`detail: false`) does not. `blocking`: anything else, Allure included.
 */
type LeakKind = 'callLog' | 'blocking';

interface Source {
  where: string;
  text: string;
  /** A Playwright step's error: a secret only in its call log is a `callLog` leak. */
  stepError?: boolean;
}

/**
 * Checks what the reports show from the test results for a secret (the account password, api key or
 * session cookie): step titles and params (including Playwright's own `Fill "<value>"` steps), errors,
 * annotations, stdout/stderr, text attachments, and this run's allure-results files. Each secret is
 * also matched JSON-escaped and URL-encoded.
 *
 * Every leak location (never the secret) goes to `SECRET_GUARD.leakFile`, and CI skips the Playwright
 * report upload. A request that fails (a timeout, a dropped connection) leaves the `Authorization`
 * header in its Playwright step's call log: that is expected, so it only keeps the HTML report back.
 * Any other leak is a test defect: it fails the run and writes `SECRET_GUARD.blockingLeakFile`, and CI
 * skips the Allure upload too.
 *
 * Out of scope: binary attachments (screenshots, videos) and trace zips. Traces are off for that
 * reason (every request context, the seeder's included, would record the `Authorization` header).
 * Listed last in the reporters.
 */
export default class SecretGuard implements Reporter {
  private readonly leaks = new Map<string, LeakKind>();
  /** Set before any reporter's onBegin, so the files AllureRunInfo writes there are scanned too. */
  private readonly startedAt = Date.now();
  private password: string | undefined;
  private apiKey: string | undefined;
  private sessionCookies: string[] = [];

  printsToStdio(): boolean {
    return false;
  }

  onBegin(): void {
    rmSync(SECRET_GUARD.leakFile, { force: true });
    rmSync(SECRET_GUARD.blockingLeakFile, { force: true });
    this.password = readPassword();
    if (this.password !== undefined && this.password.length < SECRET_GUARD.minSecretLength) {
      process.stderr.write(
        `SecretGuard: the password is shorter than ${SECRET_GUARD.minSecretLength} characters and is not checked.\n`,
      );
    }
  }

  onError(error: TestError): void {
    for (const text of errorTexts(error)) this.check({ where: 'global error', text });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const name = test.titlePath().filter(Boolean).join(' › ');
    for (const source of resultSources(test, result)) {
      this.check({ ...source, where: `${name}: ${source.where}` });
    }
  }

  onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
    for (const file of allureFilesSince(this.startedAt)) {
      this.check({ where: file, text: readFileSync(file, 'utf8') });
    }
    if (this.leaks.size === 0) return Promise.resolve(undefined);

    const locations = [...this.leaks]
      .map(([where, kind]) => `  - ${kind === 'callLog' ? '[request call log] ' : ''}${where}`)
      .join('\n');
    writeFileSync(SECRET_GUARD.leakFile, `${locations}\n`);
    if (![...this.leaks.values()].includes('blocking')) {
      process.stderr.write(
        `\nSecretGuard: ${this.leaks.size} failed request(s) left the Authorization header in their call log, ` +
          `which playwright-report/ shows. Allure is clean. Do not upload or share playwright-report/:\n${locations}\n`,
      );
      return Promise.resolve(undefined);
    }
    writeFileSync(SECRET_GUARD.blockingLeakFile, `${locations}\n`);
    process.stderr.write(
      `\nSecretGuard: a secret appeared in ${this.leaks.size} place(s) the reports show. ` +
        `Do not upload or share playwright-report/, ${ALLURE.resultsDir}/ or test-results/:\n${locations}\n`,
    );
    return Promise.resolve({ status: 'failed' });
  }

  private check({ where, text, stepError = false }: Source): void {
    const needles = this.needles();
    const contains = (part: string): boolean => needles.some((needle) => part.includes(needle));
    if (!contains(text)) return;
    const [summary = text] = text.split(CALL_LOG);
    const kind = stepError && summary !== text && !contains(summary) ? 'callLog' : 'blocking';
    if (this.leaks.get(where) !== 'blocking') this.leaks.set(where, kind);
  }

  /** The api key and session cookie are read lazily: the setup project writes them during the run. */
  private needles(): string[] {
    this.apiKey ??= readApiKey();
    if (this.sessionCookies.length === 0) this.sessionCookies = readSessionCookies();
    return secretNeedles([this.password, this.apiKey, ...this.sessionCookies]);
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
        for (const text of errorTexts(step.error)) {
          sources.push({ where: `step "${step.category}" error`, text, stepError: true });
        }
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

/**
 * This run's text files only (attachments keep their own extension, e.g. `.md`). AllureRunInfo clears
 * the folder at the start of a run; the time filter keeps the scan to this run if another reporter
 * list leaves old results behind.
 */
function allureFilesSince(startedAt: number): string[] {
  if (!existsSync(ALLURE.resultsDir)) return [];
  return readdirSync(ALLURE.resultsDir)
    .filter((file) => !BINARY_FILE.test(file))
    .map((file) => join(ALLURE.resultsDir, file))
    .filter((file) => statSync(file).isFile() && statSync(file).mtimeMs >= startedAt);
}
