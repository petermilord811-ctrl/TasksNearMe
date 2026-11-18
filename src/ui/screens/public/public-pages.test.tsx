/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  it('supports switching the journey tabs with the keyboard', async () => {
    const user = userEvent.setup();
    renderScreen(<HowItWorksScreen />);
    const posterTab = screen.getByRole('tab', { name: 'I need help' });
    posterTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'I can help' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Complete your setup' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Set up your helper profile' }).getAttribute('href')).toBe(routes.signIn(routes.app.helperOnboarding()));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('heading', { name: 'Describe your task' })).toBeDefined();
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

  it('shows remote guidance only when the supplied category allows it', () => {
    const { rerender } = renderScreen(<CategoryScreen data={furnitureCategoryPageData} now={now} />);
    expect(screen.queryByText(messages.publicPages.category.remoteNote)).toBeNull();
    expect(screen.getByText('Typical in Austin: $50.00–$80.00 per item')).toBeDefined();
    rerender(<NextIntlClientProvider locale="en" messages={messages}><CategoryScreen data={{ ...furnitureCategoryPageData, category: categoryViews[4]!, recentTasks: [], topHelpers: [] }} now={now} /></NextIntlClientProvider>);
    expect(screen.getByText(messages.publicPages.category.remoteNote)).toBeDefined();
  });
});
