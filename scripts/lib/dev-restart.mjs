/**
 * Asks the dev-server supervisor (scripts/dev-supervisor.mjs) for a fresh dev server and waits until it
 * answers again. The gate uses it between e2e shards and `heavy.mjs --fresh-dev` before a test run, so long
 * runs start on a small server instead of one that is about to hit its memory cap (the VPS has 7.7 GB).
 * Only the holder of the heavy-work lock should call it: the restart breaks any test run in progress.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
export const RESTART_REQUEST = path.join(root, 'automation/dev-restart.request');
export const SUPERVISOR_PID = path.join(root, 'automation/dev-supervisor.pid');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True while a supervisor process is alive (it writes its pid on start). */
export function supervisorRunning() {
  try {
    process.kill(Number(fs.readFileSync(SUPERVISOR_PID, 'utf8')), 0);
    return true;
  } catch {
    return false;
  }
}

async function answers(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Returns false (and does nothing) when no supervisor runs, so the caller can carry on as before.
 * `warmPath` is the page it waits for: by default the dev sign-in page, which every e2e test opens first. Not
 * /dev/ui, which compiles every preview screen into the fresh server before the run starts.
 */
export async function restartDevServer({ port = 3000, timeoutMs = 5 * 60_000, warmPath = '/dev/sign-in', log = () => {} } = {}) {
  if (!supervisorRunning()) {
    log('No dev-server supervisor is running, so the dev server was not restarted.');
    return false;
  }
  const deadline = Date.now() + timeoutMs;
  fs.writeFileSync(RESTART_REQUEST, String(Date.now()));
  log('Asked the supervisor for a fresh dev server…');
  // The supervisor removes the request once the old server is gone and the port is free.
  while (fs.existsSync(RESTART_REQUEST)) {
    if (Date.now() > deadline) throw new Error('The dev-server supervisor did not pick up the restart request.');
    await pause(500);
  }
  while (!(await answers(`http://localhost:${port}${warmPath}`))) {
    if (Date.now() > deadline) throw new Error('The restarted dev server did not answer in time.');
    await pause(1000);
  }
  log('The fresh dev server is answering.');
  return true;
}
