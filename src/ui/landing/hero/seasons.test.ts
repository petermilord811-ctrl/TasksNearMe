import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS } from '@/contracts';
import { readTaskIntent } from '@/shared/task-intent';
import messages from '../../../../messages/en/ui';
import { SEASONS, seasonAt } from './seasons';

describe('the assistant’s seasons', () => {
  it('reads the month on Austin’s calendar', () => {
    expect(seasonAt('2026-11-17T15:00:00.000Z')).toBe('fall');
    // 11:30 pm on November 30 in Austin, already December 1 in UTC.
    expect(seasonAt('2026-12-01T05:30:00.000Z')).toBe('fall');
    expect(seasonAt('2026-12-01T06:30:00.000Z')).toBe('winter');
    expect(seasonAt('2027-02-28T18:00:00.000Z')).toBe('winter');
    expect(seasonAt('2027-03-01T18:00:00.000Z')).toBe('spring');
    expect(seasonAt('2027-06-15T18:00:00.000Z')).toBe('summer');
    expect(seasonAt('2027-09-01T18:00:00.000Z')).toBe('fall');
  });

  it('has an example per season and kind of help that reads as that kind, as a request and as a skill', () => {
    for (const season of SEASONS) {
      for (const slug of CATEGORY_SLUGS) {
        const example = messages.landing.hero.seasons[season][slug];
        expect(readTaskIntent(`I need help to ${example}`).category, `${season} ${slug}: "${example}"`).toBe(slug);
        expect(readTaskIntent(`I can ${example}`).category, `${season} ${slug} as a skill`).toBe(slug);
      }
    }
  });
});
