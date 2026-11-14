// Load test at 10× private-beta volume (completion plan 5.7, B-063). Run it against staging, not a laptop or the
// VPS (it serves live sites):
//
//   k6 run -e BASE_URL=https://staging.example -e SESSIONS="$(cat sessions.json)" tests/load/beta-10x.k6.js
//
// A short check of the flows (a few iterations, no load) runs without k6 against a local production build:
//   node scripts/perf/k6-smoke.mjs http://localhost:3101
//
// Volume. The beta is 30–50 helpers and 100–150 clients (blueprint 10 §6), so 10× is about 2,000 people. Say 30% use
// it on a given day and 15% of a day's visits fall in the busiest hour: about 90 member visits in that hour, about
// 10 pages each, plus visitors from neighborhood groups reading the public pages. That is a few pages a second.
// The script holds that, then three times it, and stays within the targets below. Writes (posting, offers, paying)
// are covered by the e2e and scenario suites; this measures what people do most: reading pages.
//
// SESSIONS (optional): a JSON list of signed-in people on the target, [{ "cookie": "<Cookie header>", "role":
// "client" | "helper" }]. Make them by signing in as seeded test accounts on staging and copying the cookie. Without
// it only the public pages are exercised.
import { check, group, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
const SESSIONS = __ENV.SESSIONS ? JSON.parse(__ENV.SESSIONS) : [];
const SMOKE = __ENV.SMOKE === '1';

/** New visitors a minute in the busiest hour at 10× beta (about 900 an hour, each reading about 5 pages); then 3×. */
const PEAK = Number(__ENV.VISITORS_PER_MINUTE || 15);

export const options = SMOKE
  ? { vus: 1, iterations: 2 }
  : {
      scenarios: {
        visitors: {
          executor: 'ramping-arrival-rate',
          exec: 'visitor',
          startRate: 0,
          timeUnit: '1m',
          preAllocatedVUs: 20,
          maxVUs: 120,
          stages: [
            { duration: '2m', target: PEAK },
            { duration: '10m', target: PEAK },
            { duration: '2m', target: PEAK * 3 },
            { duration: '5m', target: PEAK * 3 },
            { duration: '1m', target: 0 },
          ],
        },
        ...(SESSIONS.length > 0
          ? {
              members: {
                executor: 'ramping-vus',
                exec: 'member',
                startVUs: 0,
                stages: [
                  { duration: '2m', target: 15 },
                  { duration: '10m', target: 15 },
                  { duration: '2m', target: 45 },
                  { duration: '5m', target: 45 },
                  { duration: '1m', target: 0 },
                ],
              },
            }
          : {}),
      },
      // Blueprint 07 §6 is about the browser (LCP under 2.5 s on a mid-range phone over 4G); the server's share of it
      // has to stay small, so pages answer within a second at p95 under load.
      thresholds: {
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.99'],
        'http_req_duration{kind:public}': ['p(95)<800', 'p(99)<2000'],
        'http_req_duration{kind:app}': ['p(95)<1000', 'p(99)<2500'],
      },
    };

const linksIn = (body, pattern) => [...new Set([...String(body || '').matchAll(pattern)].map((match) => match[1]))];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const think = (low, high) => {
  if (!SMOKE) sleep(low + Math.random() * (high - low));
};

function page(path, kind, cookie) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: { Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9', ...(cookie ? { Cookie: cookie } : {}) },
    tags: { kind, name: path.replace(/(tsk|bkg|thr|off|case)_[0-9a-z_]+/g, '$1_*').replace(/\/(tasks|helpers)\/[^/?]+$/, '/$1/*') },
    redirects: 0,
  });
  check(response, { [`${kind} page answers 200`]: (r) => r.status === 200 });
  return response;
}

/** Public pages, and task and helper pages found on them. */
export function setup() {
  const board = http.get(`${BASE_URL}/austin/tasks`, { headers: { Accept: 'text/html' } });
  const market = http.get(`${BASE_URL}/austin`, { headers: { Accept: 'text/html' } });
  const tasks = linksIn(board.body, /href="(\/tasks\/[a-z0-9-]+)"/g);
  const helpers = linksIn(`${market.body}${board.body}`, /href="(\/helpers\/[a-z0-9-]+)"/g);
  const categories = linksIn(market.body, /href="(\/austin\/[a-z0-9-]+)"/g).filter((path) => path !== '/austin/tasks');
  return { tasks, helpers, categories };
}

/** Someone from a neighborhood group: the landing page, the market, a category or the board, a task or a helper. */
export function visitor(data) {
  group('visitor', () => {
    page('/', 'public');
    think(3, 8);
    page(Math.random() < 0.5 ? '/austin' : pick(data.categories.length ? data.categories : ['/austin']), 'public');
    think(3, 8);
    page('/austin/tasks', 'public');
    think(2, 6);
    if (data.tasks.length) page(pick(data.tasks), 'public');
    think(2, 6);
    if (data.helpers.length && Math.random() < 0.6) page(pick(data.helpers), 'public');
    if (Math.random() < 0.3) page(pick(['/pricing', '/how-it-works', '/become-a-helper', '/help', '/sign-in']), 'public');
  });
}

/** A signed-in client or helper: home, their lists, one booking, messages, notifications. */
export function member() {
  const session = SESSIONS[(__VU - 1) % SESSIONS.length];
  const cookie = session.cookie;
  group(session.role === 'helper' ? 'helper' : 'client', () => {
    page('/app', 'app', cookie);
    think(3, 10);
    if (session.role === 'helper') {
      const feed = page('/app/find-work', 'app', cookie);
      think(3, 10);
      const task = pick(linksIn(feed.body, /href="(\/app\/find-work\/tsk_[0-9a-z_]+)"/g));
      if (task) page(task, 'app', cookie);
      think(3, 10);
      page('/app/offers', 'app', cookie);
    } else {
      const list = page('/app/tasks', 'app', cookie);
      think(3, 10);
      const task = pick(linksIn(list.body, /href="(\/app\/tasks\/tsk_[0-9a-z_]+)"/g));
      if (task) page(task, 'app', cookie);
    }
    think(3, 10);
    const bookings = page('/app/bookings', 'app', cookie);
    const booking = pick(linksIn(bookings.body, /href="(\/app\/bookings\/bkg_[0-9a-z_]+)"/g));
    if (booking) {
      think(3, 10);
      page(booking, 'app', cookie);
    }
    think(3, 10);
    const inbox = page('/app/messages', 'app', cookie);
    const thread = pick(linksIn(inbox.body, /href="(\/app\/messages\/thr_[0-9a-z_]+)"/g));
    if (thread) {
      think(3, 10);
      page(thread, 'app', cookie);
    }
    think(3, 10);
    page('/app/notifications', 'app', cookie);
  });
}

/** The smoke run: one visitor, and one member when SESSIONS is given. */
export default function smoke(data) {
  visitor(data);
  if (SESSIONS.length > 0) member();
}
