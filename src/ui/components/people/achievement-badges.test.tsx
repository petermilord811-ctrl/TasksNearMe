/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { BADGE_CODES } from '@/contracts';
import { noOwnBadges, samBadges, samOwnBadges } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/badges.json';
import { AchievementBadgeList, OwnBadgesPanel, TopBadges } from './achievement-badges';

afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('achievement badges', () => {
  it('have a name and a detail for every badge', () => {
    for (const code of BADGE_CODES) {
      expect(copy.names[code]).toBeTruthy();
      expect(copy.details[code]).toBeTruthy();
    }
  });

  it('word each badge from what the server counted', () => {
    render(withMessages(<AchievementBadgeList badges={samBadges} />));
    const list = within(screen.getByRole('list', { name: 'Badges' }));
    expect(list.getByText('Founding helper')).toBeTruthy();
    expect(list.getByText(/#12/)).toBeTruthy();
    expect(list.getByText('Yard cleanup pro')).toBeTruthy();
    expect(list.getByText(/25 tasks/)).toBeTruthy();
  });

  it('show at most three on a card', () => {
    render(withMessages(<TopBadges badges={samBadges} />));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('show the way to the next level and what’s up next on the account page', () => {
    render(withMessages(<OwnBadgesPanel data={samOwnBadges} />));
    expect(screen.getByRole('progressbar', { name: '27 of 50 for the next level' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeTruthy();
    cleanup();
    render(withMessages(<OwnBadgesPanel data={noOwnBadges} />));
    expect(screen.getByText('No badges yet. Your first comes with your first completed booking.')).toBeTruthy();
  });
});
