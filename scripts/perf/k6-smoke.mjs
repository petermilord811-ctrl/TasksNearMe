// A smoke run of tests/load/beta-10x.k6.js without k6 (completion plan 5.7): its flows, once or twice, against a
// local production build, to prove the paths and checks are right before the real load test runs on staging.
//
//   node scripts/perf/k6-smoke.mjs http://localhost:3101 [sessions.json]
//
// Stands in for the parts of k6 the script uses: `k6/http` get (synchronous, like k6, through curl), and `check`,
// `group` and `sleep` from `k6`. No load: one virtual user, SMOKE=1 (no think time). Exits 1 if a check fails.
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [baseUrl = 'http://localhost:3101', sessionsFile] = process.argv.slice(2);
const results = [];

globalThis.__k6smoke = { results };
const shims = {
  k6: `
    const { results } = globalThis.__k6smoke;
    export function check(value, checks) {
      let ok = true;
      for (const [name, test] of Object.entries(checks)) {
        const passed = Boolean(test(value));
        results.push({ check: name, passed, url: value?.url, status: value?.status });
        ok &&= passed;
      }
      return ok;
    }
    export function group(_name, run) { return run(); }
    export function sleep() {}
  `,
  'k6/http': `
    import { execFileSync } from 'node:child_process';
    function get(url, params = {}) {
      const args = ['-s', '-o', '-', '-w', '\\n__STATUS__%{http_code} %{time_total}', '--max-time', '120'];
      for (const [name, value] of Object.entries(params.headers ?? {})) args.push('-H', name + ': ' + value);
      const output = execFileSync('curl', [...args, url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const at = output.lastIndexOf('\\n__STATUS__');
      const [status, seconds] = output.slice(at + 11).split(' ');
      return { url, status: Number(status), body: output.slice(0, at), timings: { duration: Number(seconds) * 1000 } };
    }
    export default { get };
  `,
};
const toUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
register(
  toUrl(`
    const shims = ${JSON.stringify(Object.fromEntries(Object.entries(shims).map(([name, code]) => [name, toUrl(code)])))};
    export async function resolve(specifier, context, next) {
      if (specifier in shims) return { url: shims[specifier], shortCircuit: true };
      return next(specifier, context);
    }
  `),
);

globalThis.__ENV = { ...process.env, BASE_URL: baseUrl, SMOKE: '1', ...(sessionsFile ? { SESSIONS: fs.readFileSync(sessionsFile, 'utf8') } : {}) };
globalThis.__VU = 1;
const script = await import(path.resolve(import.meta.dirname, '../../tests/load/beta-10x.k6.js'));
const data = script.setup();
console.log(`found ${data.tasks.length} task pages, ${data.helpers.length} helper pages, ${data.categories.length} category pages`);
for (let iteration = 0; iteration < (script.options.iterations ?? 1); iteration++) script.default(data);
const failed = results.filter((result) => !result.passed);
for (const result of results) console.log(`${result.passed ? 'ok  ' : 'FAIL'} ${result.status} ${result.url}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 || data.tasks.length === 0 ? 1 : 0);
