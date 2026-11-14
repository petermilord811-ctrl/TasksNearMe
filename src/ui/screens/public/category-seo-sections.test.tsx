/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { furnitureCategoryPageData, furnitureCategoryWithSeoData, movingCategoryWithSeoEmptyData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CategoryScreen } from './category-screen';

afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
function renderScreen(element: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{element}</NextIntlClientProvider>);
}

describe('category page search sections', () => {
  it('states the real counts, the city guide, the questions and the related links', () => {
    renderScreen(<CategoryScreen data={furnitureCategoryWithSeoData} now={now} />);
    expect(screen.getByText('12 verified helpers · 5 open tasks')).toBeTruthy();

    const guide = screen.getByRole('region', { name: 'Good to know in Austin' });
    expect(within(guide).getByRole('heading', { level: 3, name: 'Apartments and stairs' })).toBeTruthy();
    expect(within(guide).getByText(/IKEA store in Round Rock/)).toBeTruthy();

    const faq = screen.getByRole('region', { name: 'Questions people ask' });
    const questions = within(faq).getAllByRole('heading', { level: 3 });
    expect(questions.map((heading) => heading.textContent)).toEqual([
      'How much does furniture assembly cost in Austin?',
      'How are helpers checked?',
      'Who sees my address?',
    ]);
    // Each question sits in its row's summary, with its answer in the same row.
    for (const question of questions) expect(question.closest('summary')?.parentElement?.tagName).toBe('DETAILS');
    expect(within(faq).getByText('Only the helper you book, and only after you confirm.')).toBeTruthy();

    const related = screen.getByRole('region', { name: 'More in Austin' });
    expect(within(related).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Moving help', '/austin/moving-help'],
      ['Yard cleanup', '/austin/yard-cleanup'],
      ['Open tasks near you in Austin', '/austin/tasks'],
      ['Pricing and fees', '/pricing'],
    ]);
  });

  it('shows no counts line at zero and no guide section without a guide', () => {
    renderScreen(<CategoryScreen data={movingCategoryWithSeoEmptyData} now={now} />);
    // The counts line reads "<n> verified helpers · <n> open tasks"; the page's own "open tasks" heading isn't it.
    expect(screen.queryByText(/^\d+ verified helpers?/)).toBeNull();
    expect(screen.queryByText(/^\d+ open tasks?$/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Good to know in Austin' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Questions people ask' })).toBeTruthy();
  });

  it('shows one count alone when only that one is above zero', () => {
    const data = { ...furnitureCategoryWithSeoData, seo: { ...furnitureCategoryWithSeoData.seo!, helperCount: 1, openTaskCount: 0 } };
    renderScreen(<CategoryScreen data={data} now={now} />);
    expect(screen.getByText('1 verified helper')).toBeTruthy();
  });

  it('adds nothing when the page has no search content', () => {
    renderScreen(<CategoryScreen data={furnitureCategoryPageData} now={now} />);
    for (const name of ['Good to know in Austin', 'Questions people ask', 'More in Austin']) {
      expect(screen.queryByRole('region', { name })).toBeNull();
    }
  });
});
