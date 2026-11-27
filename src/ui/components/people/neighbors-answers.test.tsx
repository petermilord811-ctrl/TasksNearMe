/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PROFILE_NOW, samNeighborsAnswers, samProfilePageData, samProfileWithAnswersData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { HelperProfileScreen } from '@/ui/screens/public/helper-profile-screen';
import { NeighborsAnswers } from './neighbors-answers';

afterEach(cleanup);
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">{node}</NextIntlClientProvider>);

/** "Answers on Neighbors" (2026-11-24). */
describe('NeighborsAnswers', () => {
  it('quotes what was asked, the answer shortened and where, never who asked', () => {
    wrap(<NeighborsAnswers answers={samNeighborsAnswers} headingId="answers" />);
    const section = screen.getByRole('region', { name: 'Answers on Neighbors' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(3);
    expect(within(section).getByText('Is it worth anchoring a short dresser?')).toBeDefined();
    expect(within(section).getByText('Asked in Mueller')).toBeDefined();
    expect(within(section).getByText('7 found it helpful')).toBeDefined();
    expect(within(section).getByText(/on 4 questions/)).toBeDefined();
  });

  it('shows on the profile with "Helped 4 neighbors on Neighbors", and not before anyone marked one', () => {
    wrap(<HelperProfileScreen data={samProfileWithAnswersData} now={PROFILE_NOW} />);
    expect(screen.getByText('Helped 4 neighbors on Neighbors')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Answers on Neighbors' })).toBeDefined();
    cleanup();
    wrap(<HelperProfileScreen data={samProfilePageData} now={PROFILE_NOW} />);
    expect(screen.queryByText(/on Neighbors$/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Answers on Neighbors' })).toBeNull();
  });
});
