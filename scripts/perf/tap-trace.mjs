// Where an interaction's time goes on the main thread: a Chrome trace around one tap, on the phone profile (4× CPU),
// summarized by trace event (style, layout, scripts by file). Usage: node tap-trace.mjs <base> <path> <what> [type]
// <what>: "menu" (the account menu) or "label:<field label>" (focus a field), or "button:<name>".
import { chromium } from 'playwright';

const [base, path, what, type, pointer = 'touch'] = process.argv.slice(2);
const touch = pointer !== 'mouse';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: touch, locale: 'en-US' };
const browser = await chromium.launch();
const signIn = await browser.newContext(PHONE);
const p0 = await signIn.newPage();
await p0.goto(`${base}/dev/sign-in`, { timeout: 120_000 });
const form = p0.getByRole('form', { name: 'Sign in by email' });
await form.getByLabel('Email').fill('jordan@example.test');
await form.getByRole('button', { name: 'Sign in' }).click();
await p0.waitForURL(/\/app(\/|$|\?)/, { timeout: 120_000 });
const storageState = await signIn.storageState();
await signIn.close();

const context = await browser.newContext({ ...PHONE, storageState });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180_000 });
await page.waitForTimeout(8000);
const target = what === 'menu' ? page.getByRole('button', { name: /account menu/i }).first()
  : what.startsWith('label:') ? page.getByLabel(what.slice(6)) : page.getByRole('button', { name: what.slice(7) }).filter({ visible: true }).first();
await target.waitFor({ state: 'visible', timeout: 15_000 });
const events = [];
cdp.on('Tracing.dataCollected', (message) => events.push(...message.value));
const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,v8.execute,blink.user_timing', transferMode: 'ReportEvents' });
if (touch) await target.tap(); else await target.click();
console.log('coarse pointer:', await page.evaluate(() => matchMedia('(pointer: coarse)').matches));
if (type) await page.keyboard.type(type, { delay: 150 });
await page.waitForTimeout(1500);
await cdp.send('Tracing.end');
await done;

// The renderer main thread: the thread with the most "RunTask" time.
const byThread = new Map();
for (const event of events) if (event.name === 'RunTask' && event.dur) byThread.set(`${event.pid}:${event.tid}`, (byThread.get(`${event.pid}:${event.tid}`) ?? 0) + event.dur);
const main = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const mine = events.filter((event) => `${event.pid}:${event.tid}` === main && event.ph === 'X' && event.dur);
const tasks = mine.filter((event) => event.name === 'RunTask').sort((a, b) => b.dur - a.dur).slice(0, 6);
console.log(`main thread ${main}: ${tasks.length} longest tasks (ms):`, tasks.map((task) => Math.round(task.dur / 1000)).join(', '));
const totals = new Map();
for (const event of mine) {
  if (event.name === 'RunTask') continue;
  let key = event.name;
  if (event.name === 'FunctionCall' || event.name === 'EvaluateScript') key = `${event.name} ${(event.args?.data?.url ?? '').replace(base, '').slice(-60)}:${event.args?.data?.functionName ?? ''}`;
  if (event.name === 'EventDispatch') key = `EventDispatch ${event.args?.data?.type ?? ''}`;
  totals.set(key, (totals.get(key) ?? 0) + event.dur);
}
for (const [key, dur] of [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`  ${(dur / 1000).toFixed(1).padStart(7)} ms  ${key}`);
// The longest style recalculations: how many elements each touched, and what invalidated styles (by reason/selector).
const recalcs = mine.filter((event) => event.name === 'UpdateLayoutTree').sort((a, b) => b.dur - a.dur).slice(0, 6);
console.log('longest style recalcs:', recalcs.map((event) => `${(event.dur / 1000).toFixed(0)} ms / ${event.args?.elementCount ?? '?'} elements`).join(', '));
const reasons = new Map();
for (const event of events) {
  if (!/InvalidationTracking/.test(event.name)) continue;
  const data = event.args?.data ?? {};
  const key = `${event.name.replace('InvalidationTracking', '')} ${data.reason ?? ''} ${(data.invalidationList ?? []).map((item) => (item.classes ?? item.attributes ?? item.id ?? item.tagNames ?? []).toString()).join('|').slice(0, 80)} ${data.selectors ? JSON.stringify(data.selectors).slice(0, 100) : ''} ${data.nodeName ?? ''}`.replace(/\s+/g, ' ');
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
for (const [key, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(count).padStart(5)}x  ${key.slice(0, 220)}`);
await browser.close();
