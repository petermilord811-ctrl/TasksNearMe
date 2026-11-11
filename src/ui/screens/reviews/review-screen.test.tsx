/** @vitest-environment jsdom */
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ACTION_ERROR_CODES, CLIENT_REVIEW_TAGS, HELPER_REVIEW_TAGS, REVIEW_UNAVAILABLE_REASONS, routes, type ActionResult, type ReviewInput } from '@/contracts';
import { deskReviewByClientData, deskReviewByHelperData, deskReviewPublishedData, deskReviewSubmittedData, fakeHandler, reviewUnavailableData } from '@/fixtures';
import { formatDate } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { ReviewContent, ReviewScreen } from './review-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = '2026-11-22T15:00:00.000Z';
function mount(props: Partial<ComponentProps<typeof ReviewContent>> = {}) {
  const handlers = { onSubmit: vi.fn(fakeHandler<ReviewInput>({ ok: true, code: 'submitted' }, 0)) };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><ReviewContent data={deskReviewByClientData} handlers={handlers} now={now} {...props} /></NextIntlClientProvider>) };
}

describe('ReviewScreen', () => {
  it('shows one heading, the task, its Central date and the double-blind note', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><ReviewScreen data={deskReviewByClientData} handlers={{ onSubmit: fakeHandler() }} now={now} /></NextIntlClientProvider>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'How was Jordan T.?' })).toBeInTheDocument();
    expect(screen.getByText(deskReviewByClientData.booking.title)).toBeInTheDocument();
    expect(screen.getByText(formatDate(deskReviewByClientData.booking.start, { withYear: true }))).toBeInTheDocument();
    expect(screen.getByText('Reviews stay hidden until you both send yours, or until Sat, Dec 5.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.review.backToBooking })).toHaveAttribute('href', routes.app.booking(deskReviewByClientData.booking.id));
  });

  it('requires a rating and announces the error on the focused first star', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const group = screen.getByRole('radiogroup', { name: messages.review.rating });
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(within(group).getAllByRole('radio')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    expect(await screen.findByText(messages.review.ratingRequired)).toBeInTheDocument();
    const first = screen.getByRole('radio', { name: '1 of 5 stars' });
    await waitFor(() => expect(first).toHaveFocus());
    expect(first).toHaveAccessibleDescription(`${messages.review.ratingHint} ${messages.review.ratingRequired}`);
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('supports keyboard star selection with an announced 4 of 5 stars value', async () => {
    const user = userEvent.setup();
    mount();
    await user.tab();
    expect(screen.getByRole('link', { name: messages.review.backToBooking })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('radio', { name: '1 of 5 stars' })).toHaveFocus();
    await user.keyboard(' {ArrowRight}{ArrowRight}{ArrowRight}');
    const fourth = screen.getByRole('radio', { name: '4 of 5 stars' });
    expect(fourth).toHaveFocus();
    expect(fourth).toBeChecked();
    expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);
    await user.tab();
    expect(screen.getByRole('button', { name: messages.review.tags.on_time })).toHaveFocus();
  });

  it.each([
    ['client', deskReviewByClientData, HELPER_REVIEW_TAGS],
    ['helper', deskReviewByHelperData, CLIENT_REVIEW_TAGS],
  ] as const)('shows the exact contract tag set for the %s direction', (_role, data, tags) => {
    mount({ data });
    const chips = within(screen.getByRole('group', { name: messages.review.tagsLabel })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(tags.map((tag) => messages.review.tags[tag]));
    chips.forEach((chip) => expect(chip).toHaveAttribute('aria-pressed', 'false'));
  });

  it.each([deskReviewByClientData, deskReviewByHelperData])('limits tags to five and lets a selected tag be replaced ($direction)', async (data) => {
    const user = userEvent.setup();
    mount({ data });
    const chips = within(screen.getByRole('group', { name: messages.review.tagsLabel })).getAllByRole('button');
    for (const chip of chips.slice(0, 5)) await user.click(chip);
    expect(screen.getByText(messages.review.tagsLimit)).toHaveAttribute('aria-live', 'polite');
    expect(chips[5]).toBeDisabled();
    await user.click(chips[5]);
    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(5);
    await user.click(chips[0]);
    expect(chips[5]).toBeEnabled();
    await user.click(chips[5]);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'false');
    expect(chips[5]).toHaveAttribute('aria-pressed', 'true');
    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(5);
  });

  it('submits the chosen rating, tags and trimmed text, then follows the supplied redirect', async () => {
    const user = userEvent.setup();
    const redirectTo = routes.app.booking(deskReviewByClientData.booking.id);
    const onSubmit = vi.fn(fakeHandler<ReviewInput>({ ok: true, code: 'submitted', redirectTo }, 0));
    mount({ handlers: { onSubmit } });
    await user.click(screen.getByRole('radio', { name: '4 of 5 stars' }));
    await user.click(screen.getByRole('button', { name: messages.review.tags.careful }));
    await user.click(screen.getByRole('button', { name: messages.review.tags.tidy }));
    await user.type(screen.getByRole('textbox', { name: messages.review.bodyLabel }), '  Careful work.  ');
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ rating: 4, tags: ['careful', 'tidy'], body: 'Careful work.' }));
    expect(await screen.findByText(messages.review.sent)).toBeInTheDocument();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
    expect(screen.getByRole('button', { name: messages.review.send })).toBeDisabled();
  });

  it('allows a one-star review with no tags or text', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('radio', { name: '1 of 5 stars' }));
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalledExactlyOnceWith({ rating: 1, tags: [], body: '' }));
  });

  it('counts text and rejects text beyond the 1,000-character limit', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('radio', { name: '3 of 5 stars' }));
    const body = screen.getByRole('textbox', { name: messages.review.bodyLabel });
    expect(body).toHaveAttribute('maxlength', '1000');
    fireEvent.change(body, { target: { value: 'a'.repeat(1001) } });
    expect(screen.getByText('1001 / 1,000 characters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    expect(await screen.findByText(messages.forms.fieldErrors.too_long)).toBeInTheDocument();
    await waitFor(() => expect(body).toHaveFocus());
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('disables the form, shows pending status and prevents duplicate sends', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onSubmit = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount({ handlers: { onSubmit } });
    await user.click(screen.getByRole('radio', { name: '5 of 5 stars' }));
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    const pending = screen.getByRole('button', { name: messages.review.sending });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('form', { name: messages.review.yourReview })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: messages.review.bodyLabel })).toBeDisabled();
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
    await user.click(pending);
    fireEvent.submit(screen.getByRole('form', { name: messages.review.yourReview }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: false, code: 'unknown' }));
    expect(screen.getByRole('button', { name: messages.review.send })).toBeEnabled();
  });

  it.each(['rating', 'tags', 'body'] as const)('maps and focuses a server %s error', async (field) => {
    mount({ initialResult: { ok: false, code: 'validation_failed', fieldErrors: { [field]: ['invalid'] } } });
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
    const control = field === 'rating' ? screen.getByRole('radio', { name: '1 of 5 stars' })
      : field === 'tags' ? screen.getByRole('button', { name: messages.review.tags.on_time })
        : screen.getByRole('textbox', { name: messages.review.bodyLabel });
    await waitFor(() => expect(control).toHaveFocus());
    expect(screen.getByText(messages.feedback.error.validation_failed)).toBeInTheDocument();
  });

  it('focuses a usable tag when the first tag is disabled at the limit', async () => {
    const user = userEvent.setup();
    mount({ handlers: { onSubmit: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { tags: ['invalid'] } }, 0) } });
    await user.click(screen.getByRole('radio', { name: '5 of 5 stars' }));
    const group = screen.getByRole('group', { name: messages.review.tagsLabel });
    const chips = within(group).getAllByRole('button');
    for (const chip of chips.slice(1, 6)) await user.click(chip);
    expect(chips[0]).toBeDisabled();
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
    await waitFor(() => expect(group).toContainElement(document.activeElement as HTMLElement));
  });

  it.each(ACTION_ERROR_CODES)('renders friendly feedback for %s', (code) => {
    mount({ initialResult: { ok: false, code } });
    const text = code === 'not_allowed' ? messages.review.notAllowed
      : code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors]
        : messages.feedback.error[code];
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('turns rejected handlers into a retryable error and preserves entered values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('offline'));
    mount({ handlers: { onSubmit } });
    await user.click(screen.getByRole('radio', { name: '2 of 5 stars' }));
    await user.type(screen.getByRole('textbox', { name: messages.review.bodyLabel }), 'Still want to send this.');
    await user.click(screen.getByRole('button', { name: messages.review.send }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2 of 5 stars' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: messages.review.bodyLabel })).toHaveValue('Still want to send this.');
    expect(screen.getByRole('button', { name: messages.review.send })).toBeEnabled();
  });

  it('shows a sent review read-only and keeps the supplied hidden state even after its date', () => {
    mount({ data: deskReviewSubmittedData, now: '2026-12-06T15:00:00.000Z' });
    expect(screen.getByText(deskReviewSubmittedData.mine!.body!)).toBeInTheDocument();
    expect(screen.getByText('5 out of 5, 1 review')).toBeInTheDocument();
    expect(screen.getByText('Becomes visible when Jordan T. sends theirs, or on Sat, Dec 5.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages.review.send })).not.toBeInTheDocument();
  });

  it('shows the supplied publication date and does not suppress low ratings', () => {
    mount({ data: { ...deskReviewPublishedData, mine: { ...deskReviewPublishedData.mine!, rating: 1 } } });
    expect(screen.getByText('1 out of 5, 1 review')).toBeInTheDocument();
    expect(screen.getByText(`Visible since ${formatDate(deskReviewPublishedData.mine!.publishedAt!)}`)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it.each(REVIEW_UNAVAILABLE_REASONS)('explains %s and links back to the booking', (reason) => {
    mount({ data: reviewUnavailableData[reason] });
    expect(screen.getByText(messages.review.unavailable[reason])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.review.backToBooking })).toHaveAttribute('href', routes.app.booking(reviewUnavailableData[reason].booking.id));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('has copy for every direction tag and unavailable reason', () => {
    [...CLIENT_REVIEW_TAGS, ...HELPER_REVIEW_TAGS].forEach((tag) => expect(messages.review.tags[tag]).toEqual(expect.any(String)));
    REVIEW_UNAVAILABLE_REASONS.forEach((reason) => expect(messages.review.unavailable[reason]).toEqual(expect.any(String)));
  });
});
