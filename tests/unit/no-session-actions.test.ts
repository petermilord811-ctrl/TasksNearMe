import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Authorization sweep, part 1 (B-061): every Server Action, called by a stranger with no session through the
 * public address, must refuse without reading or writing anything. The database and Better Auth's API are
 * replaced by tripwires; an action that touches either, or answers `ok`, fails here. The few actions that are
 * public on purpose (signing in, the waitlist, the landing page's assistant, one-click unsubscribe) are listed
 * in PUBLIC with the reason; a new action must either check the session first or be added there knowingly.
 */

// Modules read these when they load; test values only (no database or provider is reached).
vi.hoisted(() => {
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-the-no-session-sweep';
});

const touched: string[] = [];

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

const tripwire = (label: string) =>
  new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then' || typeof property === 'symbol') return undefined;
        touched.push(`${label}.${String(property)}`);
        throw new Error(`${label}.${String(property)} touched without a session`);
      },
    },
  );

vi.mock('@/platform/db/client', () => ({ db: tripwire('db') }));
vi.mock('@/platform/auth/auth', () => ({
  auth: {
    api: new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'then' || typeof property === 'symbol') return undefined;
          if (property === 'getSession') return async () => null;
          return async () => {
            touched.push(`auth.api.${String(property)}`);
            throw new Error(`auth.api.${String(property)} called without a session`);
          };
        },
      },
    ),
  },
}));
vi.mock('@/platform/auth/viewer', () => ({
  getViewer: async () => ({ kind: 'public' }),
  getSessionAccountId: async () => null,
  getPublicShellViewer: async () => ({ kind: 'public' }),
  toSignedInViewer: () => {
    throw new Error('no viewer');
  },
  toStaffViewer: () => {
    throw new Error('no viewer');
  },
}));
vi.mock('next/headers', () => ({
  // A stranger through the public proxy.
  headers: async () => new Headers({ host: 'app.example.test', 'x-forwarded-for': '203.0.113.7', origin: 'https://app.example.test' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
}));
vi.mock('next/cache', () => ({
  refresh: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  permanentRedirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new Redirected('not-found');
  },
}));
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => undefined, connection: async () => undefined }));

/** Public on purpose, with why. Each may read or write (rate limits, the waitlist), but never as someone. */
const PUBLIC: Record<string, string> = {
  'accounts/sign-in/actions#requestEmailCode': 'signing in starts here (Turnstile, rate limits)',
  'accounts/sign-in/actions#resendEmailCode': 'needs the pending-email cookie this browser got',
  'accounts/sign-in/actions#verifyEmailCode': 'checks the emailed code',
  'accounts/sign-in/actions#changeEmail': 'clears this browser’s pending email',
  'accounts/sign-in/actions#continueWith': 'starts Google or Microsoft sign-in',
  'accounts/sign-in/actions#passkeySignInOptions': 'a WebAuthn challenge',
  'accounts/sign-in/actions#passkeySignIn': 'checks the device’s signed answer',
  'accounts/sign-in/actions#signOutOfSignUp': 'signs this browser out',
  'accounts/sign-in/sign-up-actions#startSignUp': 'creating an account starts here (Turnstile, then sign-in’s code with its rate limits)',
  'accounts/sign-in/sign-up-actions#signUpWith': 'starts Google or Microsoft sign-in, keeping what the person is here for',
  'accounts/actions#signOut': 'signs this browser out',
  'marketing/actions#joinWaitlistAction': 'the public waitlist (rate-limited per address)',
  'marketing/actions#unsubscribeWaitlistByLinkAction': 'the waitlist email’s unsubscribe page (8.3), with its signed token; 20 an hour per token',
  'marketing/actions#resubscribeWaitlistByLinkAction': 'undoing it on the same page, with the same token',
  'marketing/assistant-actions#suggestTaskWithAi': 'the landing page’s assistant (rate-limited per visitor and site-wide)',
  'support/public-actions#submitPublicSupportAction': 'the signed-out contact form at /help/contact (5.22): Turnstile, 3 a day per address, 5 an hour per IP; opens a case for the typed address, never as an account',
  'accounts/contact-revert-actions#confirmContactRevertAction': 'the “Not you?” link in a contact change notice (5.23): a signed, single-use, 7-day link, 10 tries an hour per IP and 5 per link; it secures the account it names and never signs anyone in',
  'notifications/unsubscribe-actions#unsubscribeByLinkAction': 'the unsubscribe page, with the email’s signed token',
  'notifications/unsubscribe-actions#resubscribeByLinkAction': 'undoing it on the same page, with the same token',
  'verification/actions#onboardingRefreshStatus': 'without a session it only refreshes the page (reads and writes nothing)',
};

const ROOT = path.resolve(__dirname, '../..');
function actionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return actionFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    // The file's own directive, in either quotes (an inline one in a function is indented, and isn't this).
    return /^(['"])use server\1;?\s*$/m.test(fs.readFileSync(full, 'utf8')) ? [full] : [];
  });
}

// Every place an action can live, not only modules (security review SEC23): routes and platform code too.
const files = ['src/modules', 'src/app', 'src/platform'].flatMap((dir) => actionFiles(path.join(ROOT, dir)));
/** A file's key in PUBLIC: modules by their path inside src/modules (as before), others by their path inside src. */
const keyOf = (file: string) => {
  const inModules = path.relative(path.join(ROOT, 'src/modules'), file);
  return (inModules.startsWith('..') ? path.relative(path.join(ROOT, 'src'), file) : inModules).split(path.sep).join('/').replace(/\.tsx?$/, '');
};
const modules = new Map<string, Record<string, unknown>>();

beforeAll(async () => {
  for (const file of files) modules.set(keyOf(file), (await import(/* @vite-ignore */ file)) as Record<string, unknown>);
}, 120_000);

afterAll(() => vi.restoreAllMocks());

describe('every Server Action without a session', () => {
  it('finds the action files, outside modules too', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.map(keyOf)).toContain('platform/auth/dev-sign-in');
  });

  it('refuses without touching the database or signing anyone in (except the listed public ones)', async () => {
    const failures: string[] = [];
    const seen: string[] = [];
    for (const [key, exports] of modules) {
      for (const [name, value] of Object.entries(exports)) {
        if (typeof value !== 'function') continue;
        const id = `${key}#${name}`;
        seen.push(id);
        if (PUBLIC[id]) continue;
        touched.length = 0;
        let outcome: string;
        try {
          const result = (await (value as (...args: unknown[]) => Promise<unknown>)(undefined, undefined, undefined)) as { ok?: boolean; code?: string } | undefined;
          outcome = result && typeof result === 'object' && 'ok' in result ? (result.ok ? `ok ${result.code}` : `refused ${result.code}`) : `returned ${JSON.stringify(result)?.slice(0, 60)}`;
        } catch (error) {
          outcome = error instanceof Redirected ? `redirect ${error.to}` : `threw ${(error as Error).message.slice(0, 80)}`;
        }
        if (touched.length > 0) failures.push(`${id}: touched ${[...new Set(touched)].join(', ')} (${outcome})`);
        else if (outcome.startsWith('ok')) failures.push(`${id}: answered ${outcome}`);
      }
    }
    expect(seen.length).toBeGreaterThan(150);
    expect(failures).toEqual([]);
    expect(Object.keys(PUBLIC).filter((id) => !seen.includes(id)), 'PUBLIC lists actions that no longer exist').toEqual([]);
  }, 120_000);
});

/**
 * The same sweep, read from the source: refusing garbage input can come from validation alone, so every
 * action that isn't public must also reach a session check (directly, or through a helper in its file that
 * does). Validation may come first; acting may not.
 */
// `isLocalRequest`: development tools that only answer on this machine (src/shared/local-request.ts).
const SESSION_CHECKS = ['getViewer', 'getSessionAccountId', 'currentSessionUserId', 'requireUserId', 'auth.api.getSession', 'isLocalRequest'];

function functionBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const starts = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  for (const match of source.matchAll(starts)) {
    const name = match[1] ?? match[2]!;
    const open = source.indexOf('{', source.indexOf(')', match.index! + match[0].length - 1));
    if (open < 0) continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}' && --depth === 0) break;
    }
    bodies.set(name, source.slice(open, end + 1));
  }
  return bodies;
}

describe('every Server Action, read from the source', () => {
  it('reaches a session check unless it is public', () => {
    const unchecked: { id: string; name: string; body: string }[] = [];
    const checkedActions = new Set<string>();
    for (const file of files) {
      const key = keyOf(file);
      const source = fs.readFileSync(file, 'utf8');
      const bodies = functionBodies(source);
      // Local helpers that check the session (`staff()`, `signedInUserId()`, …), found until nothing new is.
      const checking = new Set<string>();
      let grew = true;
      while (grew) {
        grew = false;
        for (const [name, body] of bodies) {
          if (checking.has(name)) continue;
          if (SESSION_CHECKS.some((check) => body.includes(`${check}(`)) || [...checking].some((helper) => new RegExp(`\\b${helper}\\(`).test(body))) {
            checking.add(name);
            grew = true;
          }
        }
      }
      for (const match of source.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
        const name = match[1]!;
        if (checking.has(name)) checkedActions.add(name);
        else if (!PUBLIC[`${key}#${name}`]) unchecked.push({ id: `${key}#${name}`, name, body: bodies.get(name) ?? '' });
      }
    }
    // An action that hands over to another action that checks (onboarding reusing the account page's) is fine.
    const missing = unchecked.filter(({ body }) => ![...checkedActions].some((action) => new RegExp(`\\b${action}\\(`).test(body))).map(({ id }) => id);
    expect(missing).toEqual([]);
  });
});
