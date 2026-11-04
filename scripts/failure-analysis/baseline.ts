import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Analysis } from './types';
import { ANALYSIS } from '../../src/config/constants';

function read(path: string): Analysis | null {
  if (!existsSync(path)) return null;
  try {
    const analysis = JSON.parse(readFileSync(path, 'utf8')) as Analysis;
    return analysis.schemaVersion === ANALYSIS.schemaVersion ? analysis : null;
  } catch {
    return null;
  }
}

/** Run start in ms; an unknown start sorts as oldest and never blocks a comparison. */
const startOf = (start: string | null): number => (start === null ? 0 : Date.parse(start));

/**
 * The analysis of the most recent earlier run, for new-vs-recurring: the newest of
 * `failure-analysis.json` and `failure-analysis.previous.json` that is not the current run and did
 * not start after it.
 *
 * `failure-analysis.json` is kept as the previous one only when it is that baseline and newer than
 * the existing previous file. So re-analysing a run keeps its baseline, and analysing an older
 * results folder (`--results <old dir>`) neither rotates anything nor becomes the baseline of the
 * newer run analysed after it.
 */
export function previousAnalysis(
  current: { id: string; start: string | null },
  dir = '.',
): Analysis | null {
  const latestPath = join(dir, ANALYSIS.jsonFile);
  const previousPath = join(dir, ANALYSIS.previousFile);
  const latest = read(latestPath);
  const previous = read(previousPath);
  const isEarlierRun = (analysis: Analysis | null): analysis is Analysis =>
    analysis !== null &&
    analysis.run.id !== current.id &&
    (current.start === null || startOf(analysis.run.start) <= startOf(current.start));
  const baseline =
    [latest, previous]
      .filter(isEarlierRun)
      .sort((a, b) => startOf(b.run.start) - startOf(a.run.start))[0] ?? null;
  if (baseline && baseline === latest) copyFileSync(latestPath, previousPath);
  return baseline;
}
