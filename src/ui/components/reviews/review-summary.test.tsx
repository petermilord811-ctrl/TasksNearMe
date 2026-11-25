/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { samReviewSummary } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { ReviewSummaryCard } from './review-summary';

afterEach(cleanup);

describe('What neighbors say', () => {
  it("shows the points in the page's language, and says it was summarized with AI from how many reviews", () => {
    render(<NextIntlClientProvider locale="en" messages={messages} onError={(error) => { throw error; }}><ReviewSummaryCard summary={samReviewSummary} /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 3, name: messages.helperProfile.reviewSummary.title })).toBeVisible();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(samReviewSummary.points.en);
    expect(screen.getByText('Summarized with AI from 3 reviews. Read them below.')).toBeVisible();
    cleanup();
    render(<NextIntlClientProvider locale="es" messages={esMessages} onError={(error) => { throw error; }}><ReviewSummaryCard summary={samReviewSummary} /></NextIntlClientProvider>);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(samReviewSummary.points.es);
    expect(screen.getByText('Resumido con IA de 3 reseñas. Léelas abajo.')).toBeVisible();
  });
});
