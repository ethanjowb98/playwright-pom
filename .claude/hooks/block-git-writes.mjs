#!/usr/bin/env node
// PreToolUse guard: Claude must never commit, push, merge, rewrite history or open PRs.
// The user performs every git write except creating a milestone branch.
// Exit code 2 blocks the tool call and shows stderr to Claude.

import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const command = String(input?.tool_input?.command ?? '');

// `git` followed by optional global flags (e.g. `-C dir`, `-c k=v`, `--no-pager`), then a blocked subcommand.
const GIT_GLOBAL_FLAGS = String.raw`(?:\s+(?:-[cC]\s+\S+|--?[\w-]+(?:=\S+)?))*`;
const BLOCKED_GIT = String.raw`(?:commit|push|merge|rebase|tag|cherry-pick|revert|am|reset\s+--hard|update-ref|filter-branch)`;
const rules = [
  {
    re: new RegExp(String.raw`\bgit${GIT_GLOBAL_FLAGS}\s+${BLOCKED_GIT}\b`, 'i'),
    what: 'git commit/push/merge/rebase/tag/reset --hard',
  },
  { re: /\bgh\s+pr\s+(?:create|merge|ready|edit)\b/i, what: 'gh pr create/merge' },
  { re: /\bgh\s+(?:repo|release)\s+(?:create|delete|edit)\b/i, what: 'gh repo/release writes' },
];

const hit = rules.find(({ re }) => re.test(command));
if (hit) {
  process.stderr.write(
    `Blocked by .claude/hooks/block-git-writes.mjs: ${hit.what} is not allowed in this repo.\n` +
      'Leave changes uncommitted on the milestone branch and hand off a one-line commit message, PR title and PR body to the user.\n',
  );
  process.exit(2);
}
process.exit(0);
