#!/usr/bin/env node
/**
 * Commits only the paths you name, whatever else is staged. The sessions sharing this checkout share one git
 * index, so a plain `git commit` takes everyone's staged files (it happened three times on 2026-11-14).
 *
 *   node scripts/commit-own.mjs -m "Subject" [-m "Body"] [--allow-empty] -- <path> [<path>=<file>] ...
 *
 * `<path>` commits the working tree's version of that path (a deleted file is committed as deleted).
 * `<path>=<file>` commits the content of <file> as <path>, for a shared file that also holds others' uncommitted
 * lines: write HEAD's version plus your own lines to a scratch file and name it here.
 *
 * It builds the commit from a private index based on HEAD and moves the branch only if HEAD is still that commit
 * (`git update-ref` with the old value), retrying if another session committed meanwhile, so it never undoes their
 * commit either. Then it resets just those paths in the shared index to the new HEAD. The author is the repository's
 * last author, as the sessions commit (git has no identity here). Put the Co-Authored-By line in your message.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const messages = [];
const entries = [];
let allowEmpty = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '-m') messages.push(argv[(i += 1)] ?? '');
  else if (argv[i] === '--allow-empty') allowEmpty = true;
  else if (argv[i] === '--') {
    entries.push(...argv.slice(i + 1));
    break;
  } else entries.push(argv[i]);
}
if (messages.length === 0 || (entries.length === 0 && !allowEmpty)) {
  console.error('Usage: node scripts/commit-own.mjs -m "Subject" [-m "Body"] [--allow-empty] -- <path> [<path>=<file>] ...');
  process.exit(2);
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-own-'));
const privateIndex = path.join(scratch, 'index');
const git = (args, env = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const paths = entries.map((entry) => entry.split('=')[0]);

const author = {
  GIT_AUTHOR_NAME: git(['log', '-1', '--format=%an']),
  GIT_AUTHOR_EMAIL: git(['log', '-1', '--format=%ae']),
};
const identity = { ...author, GIT_COMMITTER_NAME: author.GIT_AUTHOR_NAME, GIT_COMMITTER_EMAIL: author.GIT_AUTHOR_EMAIL };
const messageFile = path.join(scratch, 'message');
fs.writeFileSync(messageFile, `${messages.join('\n\n')}\n`);

try {
  for (let attempt = 1; ; attempt += 1) {
    const base = git(['rev-parse', 'HEAD']);
    const own = { GIT_INDEX_FILE: privateIndex };
    git(['read-tree', base], own);
    for (const entry of entries) {
      const [target, source] = entry.split('=');
      if (source) {
        const blob = git(['hash-object', '-w', `--path=${target}`, source]);
        git(['update-index', '--add', '--cacheinfo', `100644,${blob},${target}`], own);
      } else {
        git(['add', '--all', '--', target], own);
      }
    }
    const tree = git(['write-tree'], own);
    if (tree === git(['rev-parse', `${base}^{tree}`]) && !allowEmpty) {
      console.error('Nothing to commit: those paths match HEAD.');
      process.exit(1);
    }
    const commit = git(['commit-tree', tree, '-p', base, '-F', messageFile], identity);
    try {
      git(['update-ref', '-m', `commit (own): ${messages[0]}`, 'HEAD', commit, base]);
    } catch (error) {
      if (attempt >= 5) throw error;
      console.error('HEAD moved while committing (another session committed); trying again on the new HEAD.');
      continue;
    }
    if (paths.length > 0) git(['reset', '-q', 'HEAD', '--', ...paths]);
    console.log(`${commit.slice(0, 7)} ${messages[0]}`);
    console.log(git(['show', '--stat', '--format=', commit]));
    break;
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
