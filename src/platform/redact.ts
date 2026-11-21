import { inspect } from 'node:util';

/**
 * Text that may reach the server's logs, a staff screen or a stored error field, without personal data or secrets
 * (when things break, 2026-11-21).
 *
 * The leaks this closes:
 * - A failed query's error from Drizzle carries the statement and its values ("params: …"): names, emails, addresses,
 *   message text. The statement is kept, the values aren't.
 * - Postgres explains a unique violation with the key's value ("Key (email)=(…) already exists"), in the error's
 *   `detail`. The code and constraint are kept, the detail isn't.
 * - A provider's refusal can name the recipient (Postmark and Resend echo the address).
 * - Secrets in error text: Stripe keys, webhook secrets, bearer tokens, `token=` and the like in URLs.
 * Addresses and message text have no shape to find, so they're kept out by not printing values at all, as above.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// E.164 as stored (+15555550123), and a US number as people write it ((555) 555-0123, 555.555.0123).
const PHONE = /\+\d{8,15}\b|\(\d{3}\)\s?\d{3}[ .-]\d{4}\b|\b\d{3}[.-]\d{3}[.-]\d{4}\b/g;
const SECRET = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{6,}|\bwhsec_[A-Za-z0-9]{6,}|\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g;
// token=, access_token=, api_key=, client_secret=, password=… (not code=: provider error codes stay readable).
const KEYED = /\b([a-z_]*(?:token|secret|password|signature|otp|key))=([^&\s"',)]+)/gi;
// A connection string's password (postgres://user:password@host).
const URL_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi;
// Drizzle's "Failed query: …\nparams: …" in a message or a stack: the values, up to the first stack frame.
const PARAMS = /\nparams: [\s\S]*?(?=\n {4}at |$)/g;

export function redactText(text: string): string {
  return text
    .replace(PARAMS, '\nparams: [hidden]')
    .replace(JWT, '[token]')
    .replace(SECRET, '[secret]')
    .replace(KEYED, (_match, name: string) => `${name}=[hidden]`)
    .replace(URL_PASSWORD, '$1[hidden]@')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]');
}

/**
 * An error as text: its name and message (a failed query's statement, not its values), the Postgres code and
 * constraint, the first stack frames, and its cause, all redacted. For text staff read: `frames: false`, and
 * `name: false` for the message alone.
 */
export function safeErrorText(error: unknown, max = 2_000, options: { frames?: boolean; name?: boolean } = {}): string {
  return redactText(describe(error, 0, { frames: options.frames ?? true, name: options.name ?? true })).slice(0, max);
}

function describe(error: unknown, depth: number, options: { frames: boolean; name: boolean }): string {
  if (!(error instanceof Error)) return typeof error === 'string' ? error : inspect(error, { depth: 2, breakLength: Infinity });
  const { query, code, constraint } = error as { query?: unknown; code?: unknown; constraint?: unknown };
  const message = typeof query === 'string' ? `Failed query: ${query.slice(0, 400)}` : error.message;
  const head = options.name ? `${error.name}: ${message}` : message;
  const codes = [code, constraint].filter((part): part is string => typeof part === 'string' && part.length > 0);
  const stack = options.frames ? (error.stack ?? '').split('\n').filter((line) => line.startsWith('    at ')).slice(0, 8).join('\n') : '';
  const cause = error.cause !== undefined && depth < 3 ? `\n  [cause] ${describe(error.cause, depth + 1, { ...options, name: true })}` : '';
  return `${head}${codes.length ? ` (${codes.join(', ')})` : ''}${stack ? `\n${stack}` : ''}${cause}`;
}

const INSTALLED = Symbol.for('tnm.consoleRedaction');
type Writer = Pick<Console, 'error' | 'warn' | 'info' | 'log'>;

/**
 * Every console line the server writes goes through redaction: errors as `safeErrorText`, strings and objects
 * masked. Installed once for a production server (src/instrumentation.ts), so a new `console.error(label, error)`
 * anywhere can't print a query's values or an address. Development keeps full errors for debugging.
 */
export function installConsoleRedaction(target: Writer = console) {
  const marked = target as Writer & { [INSTALLED]?: true };
  if (marked[INSTALLED]) return;
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    const write = target[level].bind(target);
    target[level] = (...args: unknown[]) => write(...args.map(safeLogArgument));
  }
  marked[INSTALLED] = true;
}

function safeLogArgument(argument: unknown): unknown {
  if (typeof argument === 'string') return redactText(argument);
  if (argument instanceof Error) return safeErrorText(argument);
  if (argument === null || typeof argument !== 'object') return argument;
  return redactText(inspect(argument, { depth: 4, breakLength: Infinity }));
}
