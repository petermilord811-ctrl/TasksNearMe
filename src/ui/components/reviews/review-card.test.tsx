/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { HELPER_REVIEW_TAGS, routes, type PublicReviewView } from '@/contracts';
import { samProfilePageData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import reviews from '../../../../messages/en/ui/reviews.json';
import { ReviewCard } from './review-card';

afterEach(cleanup);

function renderReview(review: PublicReviewView, reportHref?: string) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, reviews }}><ReviewCard review={review} reportHref={reportHref} /></NextIntlClientProvider>);
}

describe('ReviewCard', () => {
  it('shows the supplied author, rating, full date, category, and note', () => {
    const review = samProfilePageData.reviews[0]!;
    renderReview(review);
    expect(screen.getByRole('article', { name: 'Review by Maya R.' })).toBeInTheDocument();
    expect(screen.getByText('5 out of 5, 1 review')).toBeInTheDocument();
    expect(screen.getByText('Sun, Nov 8, 2026')).toHaveAttribute('dateTime', review.publishedAt);
    expect(screen.getByText('Furniture assembly')).toBeInTheDocument();
    expect(screen.getByText(review.body!)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Avatar with initials MR' })).toBeInTheDocument();
  });

  it.each(HELPER_REVIEW_TAGS)('gives the %s tag readable copy', (tag) => {
    renderReview({ ...samProfilePageData.reviews[0]!, tags: [tag] });
    expect(reviews.tags[tag]).toBeTruthy();
    expect(screen.getByText(reviews.tags[tag])).toBeInTheDocument();
    expect(screen.queryByText(`reviews.tags.${tag}`)).not.toBeInTheDocument();
  });

  it('renders a tags-only review without an empty body', () => {
    renderReview(samProfilePageData.reviews[2]!);
    expect(screen.getByText('Good value')).toBeInTheDocument();
    expect(screen.getByText('Ana P.')).toBeInTheDocument();
    expect(screen.getByText('4 out of 5, 1 review')).toBeInTheDocument();
    expect(screen.getByRole('article').querySelector('p.whitespace-pre-wrap')).toBeNull();
  });

  it('links to reporting the review only where the page offers it', () => {
    const review = samProfilePageData.reviews[0]!;
    renderReview(review);
    expect(screen.queryByRole('link', { name: /Report this review/ })).not.toBeInTheDocument();
    cleanup();
    renderReview(review, routes.app.report('review', review.id));
    expect(screen.getByRole('link', { name: `Report this review by ${review.author.displayName}` })).toHaveAttribute('href', routes.app.report('review', review.id));
  });
});
