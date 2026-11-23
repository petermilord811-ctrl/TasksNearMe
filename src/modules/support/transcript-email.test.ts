import { describe, expect, it } from 'vitest';
import { solvedCasePageData } from '@/fixtures';
import { renderSupportTranscript } from './emails';

/** "Email me this conversation" (2026-11-23): what the copy says, in the reader's language and their market's time. */
describe('the transcript email', () => {
  const at = new Date('2026-11-23T15:00:00.000Z');

  it('carries the conversation as the member saw it, oldest first, with who said what and when', () => {
    const email = renderSupportTranscript({ page: solvedCasePageData, firstName: 'Maya', appUrl: 'https://tasksnearme.example', locale: 'en', timeZone: 'America/New_York', now: at });
    expect(email.subject).toBe('Your conversation with TasksNearMe Help: a payment');
    expect(email.text).toContain("Hi Maya, here's your conversation with our support team about a payment, as of Mon, Nov 23 · 10:00 am.");
    expect(email.text).toContain('Times are in Eastern Time.');
    const lines = email.text.split('\n\n');
    const you = lines.findIndex((line) => line.startsWith('You · Mon, Nov 23 · 9:00 am\nI was charged twice for the desk.'));
    const joined = lines.findIndex((line) => line === 'Riley from support joined the live chat. · Mon, Nov 23 · 9:02 am');
    const riley = lines.findIndex((line) => line.startsWith('Riley from support · Mon, Nov 23 · 9:05 am\n'));
    const solved = lines.findIndex((line) => line === 'Support case: resolved · Mon, Nov 23 · 9:20 am');
    expect([you, joined, riley, solved].every((index) => index > 0)).toBe(true);
    expect(you < joined && joined < riley && riley < solved).toBe(true);
    expect(email.text).toContain('Open the case: https://tasksnearme.example/app/support/case_live');
    expect(email.html).toContain('href="https://tasksnearme.example/app/support/case_live"');
    // Someone's words are escaped, never HTML.
    const tricky = renderSupportTranscript({ page: { ...solvedCasePageData, events: [{ ...solvedCasePageData.events[0]!, body: '<b>bold</b> & more' }] }, firstName: 'Maya', appUrl: 'https://tasksnearme.example', locale: 'en', timeZone: 'America/New_York', now: at });
    expect(tricky.html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; more');
    expect(tricky.html).not.toContain('<b>bold</b>');
  });

  it('speaks Spanish, with the Spanish site’s link', () => {
    const email = renderSupportTranscript({ page: solvedCasePageData, firstName: 'Maya', appUrl: 'https://tasksnearme.example', locale: 'es', timeZone: 'America/New_York', now: at });
    expect(email.subject).toBe('Tu conversación con TasksNearMe Help: un pago');
    expect(email.text).toContain('Riley, de soporte, se unió al chat en vivo.');
    expect(email.text).toContain('Caso de soporte: resuelto');
    expect(email.html).toContain('https://tasksnearme.example/es/app/support/case_live');
  });

  it('keeps the newest lines when there are many, and says how many are in the case', () => {
    const events = Array.from({ length: 80 }, (_, index) => ({ ...solvedCasePageData.events[0]!, id: `ev_${index}`, body: `Line ${index} ${'x'.repeat(1_500)}`, at: new Date(Date.parse('2026-11-23T09:00:00.000Z') + index * 60_000).toISOString() }));
    const email = renderSupportTranscript({ page: { ...solvedCasePageData, events }, firstName: '', appUrl: 'https://tasksnearme.example', locale: 'en', timeZone: 'America/New_York', now: at });
    expect(email.html).toContain('Line 79 ');
    expect(email.html).not.toContain('Line 0 ');
    expect(email.html).toMatch(/\d+ earlier lines are in the case\./);
    expect(Buffer.byteLength(email.html, 'utf8')).toBeLessThan(60_000);
    expect(email.text.startsWith('Your conversation with support')).toBe(true);
    expect(email.text).toContain("Here's your conversation with our support team about a payment");
  });
});
