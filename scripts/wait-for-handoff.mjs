#!/usr/bin/env node
/**
 * Waits until Codex hands off a UI ticket, prints the handoff, and exits.
 * Claude runs this in the background right after a ticket is ready, so it gets notified
 * the moment Codex finishes (no need for the user to say "done").
 *
 * Usage:
 *   node scripts/wait-for-handoff.mjs UI-002 [--timeout-minutes 480] [--interval-seconds 20]
 *                                            [--quiet-minutes 5] [--updated-after now|<ISO date>]
 *
 * Signals (first one wins):
 *   1. HANDOFF  docs/ui/handoffs/UI-002.md exists (newer than --updated-after) and has stopped changing.
 *   2. FALLBACK the ticket's row in docs/ui/progress.md says "UI done" and no file under src/ui,
 *               messages/en/ui or public/ui has changed for --quiet-minutes (for Codex runs that
 *               started before the handoff rule existed).
 *   3. TIMEOUT  nothing after --timeout-minutes (exit code 2).
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ticket = args.find((a) => /^UI-\d{3}$/i.test(a))?.toUpperCase();
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (!ticket) {
  console.error('Usage: node scripts/wait-for-handoff.mjs UI-002 [--timeout-minutes 480]');
  process.exit(1);
}

const root = process.cwd();
const handoffPath = path.join(root, 'docs', 'ui', 'handoffs', `${ticket}.md`);
const progressPath = path.join(root, 'docs', 'ui', 'progress.md');
const watchedDirs = ['src/ui', 'messages/en/ui', 'public/ui'].map((dir) => path.join(root, dir));

const startedAt = Date.now();
const timeoutMs = Number(option('timeout-minutes', '480')) * 60_000;
const intervalMs = Number(option('interval-seconds', '20')) * 1000;
const quietMs = Number(option('quiet-minutes', '5')) * 60_000;
const updatedAfterArg = option('updated-after', '');
const updatedAfter =
  updatedAfterArg === 'now' ? startedAt : updatedAfterArg ? Date.parse(updatedAfterArg) || 0 : 0;

const safeStat = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};

function latestMtime(dir) {
  let latest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else latest = Math.max(latest, safeStat(full)?.mtimeMs ?? 0);
    }
  }
  return latest;
}

function progressRowSaysDone() {
  try {
    const row = fs
      .readFileSync(progressPath, 'utf8')
      .split(/\r?\n/)
      .find((line) => line.startsWith('|') && line.includes(ticket));
    return Boolean(row) && /\|\s*\**\s*UI done\s*\**\s*\|/i.test(row);
  } catch {
    return false;
  }
}

let lastSize = -1;
let lastMtime = -1;

function finish(code, lines) {
  for (const line of lines) console.log(line);
  process.exit(code);
}

function check() {
  const now = Date.now();

  const handoff = safeStat(handoffPath);
  if (handoff && handoff.mtimeMs > updatedAfter && handoff.size > 0) {
    if (handoff.size === lastSize && handoff.mtimeMs === lastMtime) {
      const body = fs.readFileSync(handoffPath, 'utf8');
      finish(0, [`HANDOFF ${ticket}: ${path.relative(root, handoffPath)}`, '-----', body]);
    }
    lastSize = handoff.size;
    lastMtime = handoff.mtimeMs;
  } else if (progressRowSaysDone()) {
    const latest = Math.max(...watchedDirs.map(latestMtime), safeStat(progressPath)?.mtimeMs ?? 0);
    if (now - latest >= quietMs) {
      const minutes = Math.round((now - latest) / 60_000);
      finish(0, [
        `FALLBACK ${ticket}: progress row says "UI done" and no UI file changed for ${minutes} min (no handoff file).`,
      ]);
    }
  }

  if (now - startedAt >= timeoutMs) {
    finish(2, [`TIMEOUT ${ticket}: no handoff after ${Math.round(timeoutMs / 60_000)} min.`]);
  }
}

console.error(`Waiting for ${ticket}: ${path.relative(root, handoffPath)} (checking every ${intervalMs / 1000}s)`);
check();
setInterval(check, intervalMs);
