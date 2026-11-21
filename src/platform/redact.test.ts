import { describe, expect, it, vi } from 'vitest';
import { installConsoleRedaction, redactText, safeErrorText } from './redact';

describe('redactText (when things break, 2026-11-21)', () => {
  it('masks emails, phone numbers, secrets and keyed values, and keeps what explains the failure', () => {
    const text = redactText([
      'Postmark 422: You tried to send to recipient(s) that have been marked as inactive: jane.doe+tasks@example.co.uk',
      'texting +15555550123 or (555) 555-0123 or 555.555.0123 failed (Twilio code 21211)',
      'Stripe said: Invalid API Key provided: sk_live_51Habcdefghij; webhook whsec_abcdefgh12; Authorization: Bearer abc.def-ghi',
      'GET /verify?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl&step=2 api_key=AIzaSyA1 client_secret=xyz',
      'connect postgres://tnm:hunter2@db.internal:5432/tnm failed',
      'on 2026-11-21T14:00:00.000Z, booking bkg_tv, 23505',
    ].join('\n'));
    for (const secret of ['jane.doe', '5555550123', '555-0123', '555.555.0123', 'sk_live_51H', 'whsec_abc', 'abc.def-ghi', 'eyJhbGci', 'AIzaSyA1', 'xyz', 'hunter2']) expect(text).not.toContain(secret);
    expect(text).toContain('[email]');
    expect(text).toContain('[phone]');
    expect(text).toContain('Twilio code 21211');
    expect(text).toContain('step=2');
    expect(text).toContain('2026-11-21T14:00:00.000Z, booking bkg_tv, 23505');
  });

  it('drops the values of a failed query, wherever the message carries them', () => {
    const message = 'Failed query: insert into "users" ("email", "name") values ($1, $2)\nparams: jane@example.com,Jane Doe\nwith a line break\n    at Object.run (/app/x.js:1:1)';
    expect(redactText(message)).toBe('Failed query: insert into "users" ("email", "name") values ($1, $2)\nparams: [hidden]\n    at Object.run (/app/x.js:1:1)');
  });
});

describe('safeErrorText', () => {
  it('describes a failed query by its statement, code and constraint, never its values or Postgres’s detail', () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), { code: '23505', constraint: 'users_email_unique', detail: 'Key (email)=(jane@example.com) already exists.' });
    const failed = Object.assign(new Error('Failed query: insert into "users" ("email") values ($1)\nparams: jane@example.com', { cause }), { name: 'DrizzleQueryError', query: 'insert into "users" ("email") values ($1)', params: ['jane@example.com'] });
    const text = safeErrorText(failed);
    expect(text).toContain('DrizzleQueryError: Failed query: insert into "users" ("email") values ($1)');
    expect(text).toContain('[cause] Error: duplicate key value violates unique constraint "users_email_unique" (23505, users_email_unique)');
    expect(text).not.toContain('jane@example.com');
    expect(text).not.toContain('Key (email)');
    expect(text).toMatch(/\n {4}at /);
  });

  it('leaves the stack out for staff screens and cuts to length', () => {
    const text = safeErrorText(new Error('Postmark 500: try later'), 20, { frames: false });
    expect(text).toBe('Error: Postmark 500:');
    expect(safeErrorText(new Error('Postmark 422: inactive recipient jane@example.com'), 300, { frames: false, name: false })).toBe('Postmark 422: inactive recipient [email]');
    expect(safeErrorText('plain text, mail me at a@b.co')).toBe('plain text, mail me at [email]');
  });
});

describe('installConsoleRedaction', () => {
  it('sends every console line through redaction, once', () => {
    const lines: unknown[][] = [];
    const target = { error: vi.fn((...args: unknown[]) => lines.push(args)), warn: vi.fn(), info: vi.fn(), log: vi.fn() };
    installConsoleRedaction(target);
    installConsoleRedaction(target);
    target.error('[jobs] reminders failed for jane@example.com', Object.assign(new Error('Failed query: select 1\nparams: +15555550123'), { query: 'select 1' }), { to: 'jane@example.com', attempt: 2 }, 3);
    expect(lines).toHaveLength(1);
    const [label, error, details, count] = lines[0]!;
    expect(label).toBe('[jobs] reminders failed for [email]');
    expect(error).toContain('Error: Failed query: select 1');
    expect(error).not.toContain('5555550123');
    expect(details).toBe("{ to: '[email]', attempt: 2 }");
    expect(count).toBe(3);
  });
});
