#!/usr/bin/env node
// Stop: refuse to finish while the project has TypeScript errors.
// Skips until tsconfig.json + typescript exist (M1). Guards against loops via stop_hook_active.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
if (input?.stop_hook_active) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
if (!existsSync(path.join(projectDir, 'tsconfig.json'))) process.exit(0);

let tscBin;
try {
  tscBin = createRequire(path.join(projectDir, 'package.json')).resolve('typescript/bin/tsc');
} catch {
  process.exit(0);
}

const result = spawnSync(process.execPath, [tscBin, '--noEmit', '-p', projectDir], {
  cwd: projectDir,
  encoding: 'utf8',
});
if (result.status !== 0) {
  process.stderr.write(`Typecheck failed. Fix these before finishing:\n${result.stdout}${result.stderr}`);
  process.exit(2);
}
process.exit(0);
