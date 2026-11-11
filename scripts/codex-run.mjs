#!/usr/bin/env node
/**
 * Runs Codex unattended on one UI ticket in a separate git worktree, independently re-checks the
 * result, commits it on the ticket branch, and records the outcome. Claude launches this in the
 * background (Bash run_in_background) and is re-invoked when it exits.
 *
 * Usage:
 *   node scripts/codex-run.mjs UI-003 [--timeout-minutes 150] [--port 3100] [--base main]
 *                                     [--worktree <dir>] [--note "<extra instructions for Codex>"]
 *
 * Writes (main worktree, git-ignored):
 *   automation/runs/UI-003.json              status: running | handed_off | failed (+ reason, branch, commit)
 *   automation/runs/UI-003.handoff.md        copy of Codex's summary (docs/ui/handoffs/UI-003.md)
 *   automation/runs/UI-003.last-message.md   Codex's final message
 *   automation/logs/UI-003-<time>.jsonl      Codex event log;  ...-check.log  independent check:ui output
 *
 * Exit codes: 0 handed off (handoff written and check:ui passes) · 1 failed · 2 bad usage or preconditions
 */
import { execFileSync, execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ticket = args.find((a) => /^UI-\d{3}$/i.test(a))?.toUpperCase();
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const root = process.cwd();
const base = option('base', 'main');
const port = option('port', '3100');
const timeoutMs = Number(option('timeout-minutes', '150')) * 60_000;
const worktree = path.resolve(option('worktree', path.join(path.dirname(root), `${path.basename(root)}-ui`)));
const note = option('note', '');

const runsDir = path.join(root, 'automation', 'runs');
const logsDir = path.join(root, 'automation', 'logs');
fs.mkdirSync(runsDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

function finish(code, line, extra = {}) {
  if (ticket) {
    const statusPath = path.join(runsDir, `${ticket}.json`);
    const previous = readJson(statusPath) ?? {};
    writeJson(statusPath, { ...previous, ...extra, finishedAt: new Date().toISOString() });
  }
  console.log(line);
  process.exit(code);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(p, value) {
  fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
}

const git = (cwd, ...gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();
const sh = (command, cwd) => execSync(command, { cwd, encoding: 'utf8', shell: true }).trim();

if (!ticket) {
  console.error('Usage: node scripts/codex-run.mjs UI-003 [--timeout-minutes 150] [--port 3100]');
  process.exit(2);
}

// ---- Ticket and preconditions -------------------------------------------------------------
const ticketsDir = path.join(root, 'docs', 'ui', 'tickets');
const ticketFile = fs
  .readdirSync(ticketsDir)
  .find((f) => f.toUpperCase().startsWith(`${ticket}-`) && f.endsWith('.md'));
if (!ticketFile) finish(2, `CODEX_RUN ${ticket} failed (no ticket file docs/ui/tickets/${ticket}-*.md)`, { status: 'failed', reason: 'no ticket file' });

const slug = ticketFile.replace(/\.md$/, '').slice(ticket.length + 1);
const branch = `ui/${ticket}-${slug}`;
const ticketRel = `docs/ui/tickets/${ticketFile}`;
const handoffRel = `docs/ui/handoffs/${ticket}.md`;

try {
  git(root, 'cat-file', '-e', `${base}:${ticketRel}`);
} catch {
  finish(2, `CODEX_RUN ${ticket} failed (ticket not committed on ${base}; commit it first)`, { status: 'failed', reason: 'ticket not committed' });
}

const statusPath = path.join(runsDir, `${ticket}.json`);
const attempt = (readJson(statusPath)?.attempt ?? 0) + 1;
const startedAt = Date.now();
const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
const logPath = path.join(logsDir, `${ticket}-${stamp}.jsonl`);
const checkLogPath = path.join(logsDir, `${ticket}-${stamp}-check.log`);
const lastMessagePath = path.join(runsDir, `${ticket}.last-message.md`);

writeJson(statusPath, {
  ticket,
  status: 'running',
  attempt,
  branch,
  worktree,
  base,
  port,
  startedAt: new Date(startedAt).toISOString(),
  log: path.relative(root, logPath),
});

// ---- Worktree ---------------------------------------------------------------------------------
try {
  if (!fs.existsSync(worktree)) {
    git(root, 'worktree', 'add', '-B', branch, worktree, base);
  } else {
    if (git(worktree, 'status', '--porcelain')) {
      git(worktree, 'stash', 'push', '-u', '-m', `autostash before ${ticket} ${stamp}`);
    }
    git(worktree, 'checkout', '-B', branch, base);
  }
} catch (error) {
  finish(2, `CODEX_RUN ${ticket} failed (worktree setup: ${String(error.message).split('\n')[0]})`, {
    status: 'failed',
    reason: 'worktree setup failed',
  });
}

// ---- Local environment ------------------------------------------------------------------------
// .env.local is gitignored, so a fresh worktree has none. Copy the main checkout's (the shared
// dev database and dev-only secrets) so the preview server and checks start the same way here.
const envSource = path.join(root, '.env.local');
const envTarget = path.join(worktree, '.env.local');
if (fs.existsSync(envSource) && fs.readFileSync(envSource, 'utf8') !== (fs.existsSync(envTarget) ? fs.readFileSync(envTarget, 'utf8') : '')) {
  fs.copyFileSync(envSource, envTarget);
}

// ---- Dependencies (npm ci only when the lockfile changed) ------------------------------------
const lockHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(worktree, 'package-lock.json'))).digest('hex');
const marker = path.join(worktree, 'node_modules', '.tnm-lock-hash');
if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== lockHash) {
  try {
    execSync('npm ci --no-audit --no-fund', { cwd: worktree, stdio: 'ignore', shell: true, timeout: 20 * 60_000 });
    fs.writeFileSync(marker, lockHash);
  } catch {
    finish(1, `CODEX_RUN ${ticket} failed (npm ci in worktree)`, { status: 'failed', reason: 'npm ci failed' });
  }
}

// ---- Codex ------------------------------------------------------------------------------------
const prompt = [
  `Read AGENTS.md, then implement the UI ticket ${ticketRel}.`,
  'You are running unattended in an automated pipeline. Nobody will answer questions or approve a plan: do not ask and do not wait. Skip any plan-approval step and work straight through.',
  'Make reasonable decisions within the ticket, AGENTS.md and docs/ui/design-system.md, and list them in your summary under "Known gaps or follow-ups".',
  'Work only inside the paths the ticket allows. Do not run git commands that change state (no commit, branch, stash, reset or checkout) and do not edit docs/ui/progress.md: the pipeline handles both.',
  `This copy of the repo must use port ${port}. PORT=${port} is set in your environment for the dev server and Playwright. Never use port 3000.`,
  'If npm reports a permission error on its cache, retry with npm_config_cache=.npm-cache (a git-ignored folder in this workspace).',
  'Before finishing, `npm run check:ui` must pass.',
  `As your very last step, write your summary to ${handoffRel} in the AGENTS.md format.`,
  note ? `Notes from Claude for this run: ${note}` : '',
]
  .filter(Boolean)
  .join('\n');

const npmRoot = sh('npm root -g');
const codexPkgDir = path.join(npmRoot, '@openai', 'codex');
const codexPkg = JSON.parse(fs.readFileSync(path.join(codexPkgDir, 'package.json'), 'utf8'));
const codexBin = path.join(codexPkgDir, typeof codexPkg.bin === 'string' ? codexPkg.bin : codexPkg.bin.codex);
const npmCache = sh('npm config get cache');

const codexArgs = [
  codexBin,
  'exec',
  '-C',
  worktree,
  '--approve-for-me',
  '-c',
  'sandbox_workspace_write.network_access=true',
  '-c',
  'shell_environment_policy.inherit=all',
  '--add-dir',
  npmCache,
  '--color',
  'never',
  '--json',
  '-o',
  lastMessagePath,
  '-',
];

const runEnv = { ...process.env, PORT: port, NEXT_TELEMETRY_DISABLED: '1' };
const logFd = fs.openSync(logPath, 'a');
const child = spawn(process.execPath, codexArgs, { cwd: worktree, env: runEnv, stdio: ['pipe', logFd, logFd] });
child.stdin.end(prompt);

let timedOut = false;
const killTimer = setTimeout(() => {
  timedOut = true;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}, timeoutMs);

const exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? -1)));
clearTimeout(killTimer);
fs.closeSync(logFd);

// ---- Verify, commit, record -------------------------------------------------------------------
const handoffAbs = path.join(worktree, handoffRel);
const handoffOk = fs.existsSync(handoffAbs) && fs.statSync(handoffAbs).mtimeMs >= startedAt;

let checkUi = 'skipped';
if (handoffOk) {
  const checkFd = fs.openSync(checkLogPath, 'a');
  try {
    execSync('npm run check:ui', {
      cwd: worktree,
      env: runEnv,
      stdio: ['ignore', checkFd, checkFd],
      shell: true,
      timeout: 25 * 60_000,
    });
    checkUi = 'pass';
  } catch {
    checkUi = 'fail';
  }
  fs.closeSync(checkFd);
  fs.copyFileSync(handoffAbs, path.join(runsDir, `${ticket}.handoff.md`));
}

let commit = null;
if (git(worktree, 'status', '--porcelain')) {
  git(worktree, 'add', '-A');
  git(
    worktree,
    'commit',
    '-m',
    `${ticket}: ${slug} (Codex, automated)`,
    '-m',
    `Codex exit ${exitCode}${timedOut ? ' (timed out)' : ''}; handoff ${handoffOk ? 'yes' : 'no'}; check:ui ${checkUi}; attempt ${attempt}.`,
  );
  commit = git(worktree, 'rev-parse', '--short', 'HEAD');
}

const ok = handoffOk && checkUi === 'pass';
const reason = ok
  ? ''
  : timedOut
    ? 'timeout'
    : !handoffOk
      ? `no handoff (codex exit ${exitCode})`
      : 'check:ui failed';
const minutes = Math.round((Date.now() - startedAt) / 60_000);

finish(
  ok ? 0 : 1,
  `CODEX_RUN ${ticket} ${ok ? 'handed_off' : 'failed'}${reason ? ` (${reason})` : ''} branch=${branch} commit=${commit ?? 'none'} check:ui=${checkUi} minutes=${minutes} attempt=${attempt}`,
  {
    status: ok ? 'handed_off' : 'failed',
    reason,
    codexExit: exitCode,
    timedOut,
    checkUi,
    commit,
    handoff: handoffOk ? path.relative(root, path.join(runsDir, `${ticket}.handoff.md`)) : null,
    lastMessage: path.relative(root, lastMessagePath),
    checkLog: handoffOk ? path.relative(root, checkLogPath) : null,
    minutes,
  },
);
