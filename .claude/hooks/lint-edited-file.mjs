#!/usr/bin/env node
// PostToolUse: run `eslint --fix` on the TypeScript file Claude just edited.
// Remaining lint errors are fed back to Claude (exit 2). Skips silently until ESLint is installed (M1).

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const filePath = input?.tool_input?.file_path;
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

if (!filePath || !/\.(ts|mts|cts)$/.test(filePath) || !existsSync(filePath)) process.exit(0);
if (!existsSync(path.join(projectDir, 'eslint.config.mjs'))) process.exit(0);

let eslintBin;
try {
  eslintBin = createRequire(path.join(projectDir, 'package.json')).resolve('eslint/bin/eslint.js');
} catch {
  process.exit(0);
}

const result = spawnSync(process.execPath, [eslintBin, '--fix', filePath], {
  cwd: projectDir,
  encoding: 'utf8',
});
if (result.status !== 0) {
  process.stderr.write(`ESLint errors remain in ${filePath}:\n${result.stdout}${result.stderr}`);
  process.exit(2);
}
process.exit(0);
