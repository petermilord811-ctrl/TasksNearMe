/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { CATEGORY_SLUGS, routes } from '@/contracts';
import { categoryViews, furnitureCategoryPageData, homeEmptyMapData, marketNoListingsData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { HomeScreen } from './home-screen';
import { CategoryScreen } from './category-screen';
import { HowItWorksScreen } from './how-it-works-screen';
import { MarketScreen } from './market-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderScreen(element: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);
}

describe('public marketing copy', () => {
  function entries(value: unknown): string[] {
    return typeof value === 'string' ? [value] : Object.values(value as Record<string, unknown>).flatMap(entries);
  }

  it.each(['publicPages', 'taskCard', 'helperCard'] as const)('%s contains no banned words', (namespace) => {
    const banned = /\b(?:escrow|wallets?|wages|employers?|hir(?:e|es|ed|ing))\b/i;
    expect(entries(messages[namespace]).filter((message) => banned.test(message))).toEqual([]);
  });

  it.each(CATEGORY_SLUGS)('has included and excluded scope for %s', (slug) => {
    const copy = messages.publicPages.categories[slug];
    expect(Object.keys(copy.included).length).toBeGreaterThan(0);
    expect(Object.keys(copy.excluded).length).toBeGreaterThan(0);
  });
});

describe("the city's page", () => {
  it("shows the city's guide when there is one, and no empty section without it", () => {
    renderScreen(<MarketScreen data={marketNoListingsData} now={now} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Getting help in Austin' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Where it works' })).toBeDefined();
    expect(screen.getByText(/only the helper you book sees the address/)).toBeDefined();
    cleanup();
    renderScreen(<MarketScreen data={{ ...marketNoListingsData, about: undefined }} now={now} />);
    expect(screen.queryByRole('heading', { name: 'Getting help in Austin' })).toBeNull();
  });
});

describe('public screen interactions', () => {
  it('opens on "I can help" and switches the journey tabs with the keyboard', async () => {
    const user = userEvent.setup();
    renderScreen(<HowItWorksScreen />);
    // "I can help" is open first (owner, 2026-11-22).
    const helperTab = screen.getByRole('tab', { name: 'I can help' });
    expect(helperTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Complete your setup' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Set up your helper profile' }).getAttribute('href')).toBe(routes.signIn(routes.app.helperOnboarding()));
    helperTab.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'I need help' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Describe your task' })).toBeDefined();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: 'Complete your setup' })).toBeDefined();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('opens the FAQ and gives the empty task list a posting action', async () => {
    const user = userEvent.setup();
    renderScreen(<HomeScreen data={homeEmptyMapData} now={now} mapMode="static" />);
    expect(screen.getByText(messages.landing.map.emptyTitle)).toBeDefined();
    const question = screen.getByRole('button', { name: 'Who can see my address?' });
    question.focus();
    await user.keyboard('{Enter}');
    expect(question.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('link', { name: /Post a task/ }).every((link) => link.getAttribute('href') === routes.app.newTask())).toBe(true);
  });

  it('puts the next step and why to trust it on the first screen, and every "Post a task" opens the wizard on the service (J-V)', () => {
    renderScreen(<CategoryScreen data={furnitureCategoryPageData} now={now} />);
    const posts = screen.getAllByRole('link', { name: 'Post a task' });
    // The first screen's and the closing one, at least.
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const link of posts) expect(link.getAttribute('href')).toBe(routes.app.newTask({ category: 'furniture-assembly' }));
    expect(screen.getByText(messages.publicPages.shared.freeToPost)).toBeDefined();
    const trust = screen.getByRole('list', { name: messages.publicPages.shared.trustPoints.label });
    expect(within(trust).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Address-verified helpers', 'Reviews only from completed bookings', 'Price agreed before you book']);
    // Before anyone posts here: the first-of-its-kind card's button too.
    cleanup();
    renderScreen(<CategoryScreen data={{ ...furnitureCategoryPageData, recentTasks: [], topHelpers: [] }} now={now} />);
    for (const link of screen.getAllByRole('link', { name: 'Post a task' })) expect(link.getAttribute('href')).toBe(routes.app.newTask({ category: 'furniture-assembly' }));
  });

  it('shows remote guidance only when the supplied category allows it', () => {
    const { rerender } = renderScreen(<CategoryScreen data={furnitureCategoryPageData} now={now} />);
    expect(screen.queryByText(messages.publicPages.category.remoteNote)).toBeNull();
    // Whole dollars, and a range that never breaks at its dash (audit L20).
    expect(screen.getByText('Typical in Austin: $50\u2060–\u2060$80 per item')).toBeDefined();
    rerender(<NextIntlClientProvider locale="en" messages={messages}><CategoryScreen data={{ ...furnitureCategoryPageData, category: categoryViews[4]!, recentTasks: [], topHelpers: [] }} now={now} /></NextIntlClientProvider>);
    expect(screen.getByText(messages.publicPages.category.remoteNote)).toBeDefined();
  });
});
