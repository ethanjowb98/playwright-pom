import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type AllureResult, isFailure, type TestOutcome } from './types';

export interface LoadedRun {
  id: string;
  executor: string | null;
  start: number | null;
  outcomes: TestOutcome[];
  /** Result files that could not be parsed (a run cut off mid-write); left out of the analysis. */
  unreadable: string[];
}

/** Reads one run's allure-results: every `*-result.json`, plus `executor.json` for the run id. */
export function loadRun(resultsDir: string): LoadedRun {
  if (!existsSync(resultsDir)) {
    throw new Error(`No ${resultsDir}/ directory. Run the tests first.`);
  }
  const results: AllureResult[] = [];
  const unreadable: string[] = [];
  for (const file of readdirSync(resultsDir).filter((name) => name.endsWith('-result.json'))) {
    try {
      results.push(JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as AllureResult);
    } catch {
      unreadable.push(file);
    }
  }
  const executor = readExecutor(resultsDir);
  const start = results.reduce<number | null>(
    (earliest, result) =>
      result.start === undefined ? earliest : Math.min(earliest ?? result.start, result.start),
    null,
  );
  return {
    // AllureRunInfo writes a unique build name per run (CI run number + attempt, or the local start time).
    id: executor ?? (start === null ? 'unknown' : new Date(start).toISOString()),
    executor,
    start,
    outcomes: groupAttempts(results),
    unreadable,
  };
}

function readExecutor(resultsDir: string): string | null {
  try {
    const raw = readFileSync(join(resultsDir, 'executor.json'), 'utf8');
    return (JSON.parse(raw) as { buildName?: string }).buildName ?? null;
  } catch {
    return null;
  }
}

const parameter = (result: AllureResult, name: string): string | undefined =>
  result.parameters?.find((p) => p.name === name)?.value;

export const label = (result: AllureResult, name: string): string | null =>
  result.labels.find((l) => l.name === name)?.value ?? null;

/**
 * One outcome per test run: `fullName` + project, + the `Repetition` parameter under `--repeat-each`
 * (each repetition is its own run). Retries are separate results with an excluded `Retry` parameter.
 */
export function groupAttempts(results: readonly AllureResult[]): TestOutcome[] {
  const byTest = new Map<string, AllureResult[]>();
  for (const result of results) {
    const project = parameter(result, 'Project') ?? '';
    const repetition = parameter(result, 'Repetition');
    const id = `${project} › ${result.fullName ?? result.name}${repetition ? ` › repetition ${repetition}` : ''}`;
    const attempts = byTest.get(id);
    if (attempts) attempts.push(result);
    else byTest.set(id, [result]);
  }
  return [...byTest.entries()]
    .flatMap(([id, attempts]) => {
      attempts.sort((a, b) => retry(a) - retry(b) || (a.start ?? 0) - (b.start ?? 0));
      const final = attempts.at(-1);
      if (!final) return [];
      return {
        id,
        name: final.name,
        fullName: final.fullName ?? final.name,
        project: parameter(final, 'Project') ?? '',
        repetition: repetitionOf(final),
        feature: label(final, 'feature'),
        attempts,
        final,
        flaky: final.status === 'passed' && attempts.some((a) => isFailure(a.status)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

const retry = (result: AllureResult): number => Number(parameter(result, 'Retry') ?? 0);

function repetitionOf(result: AllureResult): number | null {
  const value = parameter(result, 'Repetition');
  return value === undefined ? null : Number(value);
}
