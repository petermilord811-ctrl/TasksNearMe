import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { thankYouNoteInputSchema } from '@/contracts';
import { canEditThanks, canShowOnProfile, canWriteThanks, publicAuthor, showsOnProfile, thanksEditableUntil } from './domain';

const sent = new Date('2026-11-24T15:00:00.000Z');

describe('thank-you note rules', () => {
  it('only the client of a completed booking writes one, once', () => {
    expect(canWriteThanks({ bookingStatus: 'completed', viewerIsClient: true, hasNote: false })).toBe(true);
    expect(canWriteThanks({ bookingStatus: 'completed', viewerIsClient: true, hasNote: true })).toBe(false);
    expect(canWriteThanks({ bookingStatus: 'completed', viewerIsClient: false, hasNote: false })).toBe(false);
    for (const status of ['confirmed', 'in_progress', 'completion_submitted', 'disputed', 'canceled']) expect(canWriteThanks({ bookingStatus: status, viewerIsClient: true, hasNote: false })).toBe(false);
  });

  it('can be edited for 24 hours, never once hidden', () => {
    expect(thanksEditableUntil(sent).toISOString()).toBe('2026-11-25T15:00:00.000Z');
    expect(canEditThanks({ createdAt: sent, hiddenAt: null }, new Date('2026-11-25T14:59:00.000Z'))).toBe(true);
    expect(canEditThanks({ createdAt: sent, hiddenAt: null }, new Date('2026-11-25T15:00:00.000Z'))).toBe(false);
    expect(canEditThanks({ createdAt: sent, hiddenAt: new Date('2026-11-24T16:00:00.000Z') }, new Date('2026-11-24T17:00:00.000Z'))).toBe(false);
  });

  it("shows on the profile only with the helper's consent and while not hidden; stopping always works", () => {
    expect(showsOnProfile({ shownOnProfile: true, hiddenAt: null })).toBe(true);
    expect(showsOnProfile({ shownOnProfile: false, hiddenAt: null })).toBe(false);
    expect(showsOnProfile({ shownOnProfile: true, hiddenAt: sent })).toBe(false);
    expect(canShowOnProfile({ hiddenAt: sent }, true)).toBe(false);
    expect(canShowOnProfile({ hiddenAt: sent }, false)).toBe(true);
  });

  it('names the client by first name and area, or the area alone when they asked (or their account is gone)', () => {
    expect(publicAuthor({ hideName: false }, { firstName: 'Maya', deleted: false }, 'Hyde Park')).toEqual({ firstName: 'Maya', area: 'Hyde Park' });
    expect(publicAuthor({ hideName: true }, { firstName: 'Maya', deleted: false }, 'Hyde Park')).toEqual({ area: 'Hyde Park' });
    expect(publicAuthor({ hideName: false }, { firstName: 'Maya', deleted: true }, 'Hyde Park')).toEqual({ area: 'Hyde Park' });
  });

  it('takes up to 280 characters', () => {
    expect(thankYouNoteInputSchema.safeParse({ bookingId: 'bkg_1', body: 'x'.repeat(280) }).success).toBe(true);
    expect(thankYouNoteInputSchema.safeParse({ bookingId: 'bkg_1', body: 'x'.repeat(281) }).success).toBe(false);
    expect(thankYouNoteInputSchema.safeParse({ bookingId: 'bkg_1', body: '   ' }).success).toBe(false);
  });
});

describe('apart from rewards, Sparks and ranking (blueprint 05, principle 6)', () => {
  it('no reward, Spark, badge or helper-ranking code reads thank-you notes', () => {
    const roots = ['src/modules/rewards', 'src/modules/sparks', 'src/modules/badges', 'src/modules/profiles/browse.ts', 'src/modules/profiles/reliability.ts', 'src/modules/profiles/response-time.ts'];
    const files = roots.flatMap((root) => {
      const full = path.join(process.cwd(), root);
      if (!fs.existsSync(full)) return [];
      return fs.statSync(full).isDirectory() ? fs.readdirSync(full).filter((name) => name.endsWith('.ts')).map((name) => path.join(full, name)) : [full];
    });
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/modules\/thanks|thank_you_notes|thankYouNotes/);
  });
});
