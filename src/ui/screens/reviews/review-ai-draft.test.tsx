/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AiAssistResult, ReviewDraft, ReviewHandlers } from '@/contracts';
import { deskReviewByClientData, deskReviewSubmittedData, fakeHandler, reviewDraftResult } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { ReviewContent } from './review-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const copy = messages.review;
const drafts = messages.forms.aiDraft;

function show(handlers: Partial<ReviewHandlers> = {}, data = deskReviewByClientData) {
  render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages} onError={(error) => { throw error; }}>
    <ReviewContent data={data} now="2026-11-22T15:00:00.000Z" handlers={{ onSubmit: fakeHandler({ ok: true, code: 'submitted' }), ...handlers }} />
  </NextIntlClientProvider>);
}

describe('"Write it with AI" on the review form', () => {
  it('is there only when the page passes the handler (AI on), and never on a review already sent', () => {
    show();
    expect(screen.queryByRole('button', { name: copy.aiDraft.button })).not.toBeInTheDocument();
    cleanup();
    show({ onDraftReview: vi.fn() }, deskReviewSubmittedData);
    expect(screen.queryByRole('button', { name: copy.aiDraft.button })).not.toBeInTheDocument();
  });

  it('asks for the stars first, without calling AI', async () => {
    const user = userEvent.setup();
    const onDraftReview = vi.fn();
    show({ onDraftReview });
    await user.click(screen.getByRole('button', { name: copy.aiDraft.button }));
    expect(await screen.findByText(copy.aiDraft.needsRating)).toBeVisible();
    expect(onDraftReview).not.toHaveBeenCalled();
  });

  it('sends the stars, tags and typed words, fills the review, says it was drafted with AI, and Undo restores', async () => {
    const user = userEvent.setup();
    const onDraftReview = vi.fn(async (): Promise<AiAssistResult<ReviewDraft>> => reviewDraftResult);
    show({ onDraftReview });
    await user.click(screen.getAllByRole('radio')[4]!);
    await user.click(screen.getByRole('button', { name: copy.tags.careful }));
    const body = screen.getByLabelText(copy.bodyLabel);
    await user.type(body, 'quick and tidy');
    await user.click(screen.getByRole('button', { name: copy.aiDraft.button }));
    expect(onDraftReview).toHaveBeenCalledExactlyOnceWith({ rating: 5, tags: ['careful'], notes: 'quick and tidy' });
    expect(await screen.findByText(drafts.draftedSend)).toBeVisible();
    expect(body).toHaveValue(reviewDraftResult.ok ? reviewDraftResult.value.body : '');
    await user.click(screen.getByRole('button', { name: drafts.undo }));
    expect(body).toHaveValue('quick and tidy');
  });

  it('says why it could not, and keeps what was typed', async () => {
    const user = userEvent.setup();
    show({ onDraftReview: async () => ({ ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } }) });
    await user.click(screen.getAllByRole('radio')[3]!);
    await user.type(screen.getByLabelText(copy.bodyLabel), 'hello');
    await user.click(screen.getByRole('button', { name: copy.aiDraft.button }));
    expect(await screen.findByText(drafts.errors.prohibited)).toBeVisible();
    expect(screen.getByLabelText(copy.bodyLabel)).toHaveValue('hello');
  });
});
