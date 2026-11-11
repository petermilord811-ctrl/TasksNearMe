/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, CASE_STATUSES, MEMBER_CASE_KINDS, SUPPORT_TOPICS, routes, type ActionResult, type PhotoUploadResult, type SupportHandlers, type SupportPageData } from '@/contracts';
import { mayaSupportPageData, supportEmptyData, uploadedTaskPhotos } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { SupportContent, SupportScreen } from './support-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-11-23T18:30:00.000Z';
const description = 'Please help me understand the payment for my booking.';
const success = { ok: true, code: 'submitted', redirectTo: routes.app.supportCase('case_new') } as const;
const photoCopy = createTranslator({ locale: 'en', messages, namespace: 'bookingComplete.photos' });

function mount(data: SupportPageData = mayaSupportPageData, overrides: Partial<SupportHandlers> = {}) {
  const handlers = {
    onCreate: vi.fn<SupportHandlers['onCreate']>().mockResolvedValue(success),
    onUploadPhoto: vi.fn<SupportHandlers['onUploadPhoto']>().mockResolvedValue({ ok: true, photo: uploadedTaskPhotos[0]! }),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><SupportScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

async function fill(user: ReturnType<typeof userEvent.setup>, text = description) {
  await user.click(screen.getByRole('radio', { name: messages.support.topics.payment }));
  fireEvent.change(screen.getByRole('textbox', { name: messages.support.description }), { target: { value: text } });
}

describe('SupportScreen', () => {
  it('preserves supplied case order, shows readable status and unread text, and links to each case', () => {
    const data = { ...mayaSupportPageData, cases: [...mayaSupportPageData.cases].reverse() };
    mount(data);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const cases = within(screen.getByRole('region', { name: messages.support.cases }));
    expect(cases.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(data.cases.map((item) => routes.app.supportCase(item.id)));
    for (const item of data.cases) {
      expect(cases.getByRole('heading', { name: item.subject })).toBeVisible();
      expect(cases.getByText(item.status === `awaiting_${item.viewerRole}` ? messages.status.case.awaiting_you : messages.status.case[item.status])).toBeVisible();
      expect(cases.getByText(formatDateTime(item.updatedAt))).toBeVisible();
    }
    expect(cases.getAllByText(messages.support.unread)).toHaveLength(1);
    expect(cases.getByText('Updated 2 hours ago')).toBeVisible();
    expect(screen.getByRole('link', { name: messages.support.emergencyCall })).toHaveAttribute('href', 'tel:911');
  });

  it('offers the new request form when there are no cases or recent bookings', () => {
    mount(supportEmptyData);
    expect(screen.getByRole('heading', { name: messages.support.emptyTitle })).toBeVisible();
    expect(screen.getByText(messages.support.emptyBody)).toBeVisible();
    expect(screen.getByRole('form', { name: messages.support.newRequest })).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: messages.support.booking })).toHaveValue('');
  });

  it.each(['poster', 'helper'] as const)('uses the supplied %s role to label their waiting cases', (viewerRole) => {
    const item = mayaSupportPageData.cases[0]!;
    mount({ ...mayaSupportPageData, cases: [
      { ...item, id: 'waiting-poster', status: 'awaiting_poster', viewerRole },
      { ...item, id: 'waiting-helper', status: 'awaiting_helper', viewerRole },
    ] });
    const cases = within(screen.getByRole('region', { name: messages.support.cases }));
    const rows = cases.getAllByRole('listitem');
    expect(rows[viewerRole === 'poster' ? 0 : 1]).toHaveTextContent(messages.status.case.awaiting_you);
    expect(rows[viewerRole === 'poster' ? 1 : 0]).toHaveTextContent(messages.status.case[viewerRole === 'poster' ? 'awaiting_helper' : 'awaiting_poster']);
  });

  it('has translated labels for every topic, case kind and case status', () => {
    const data: SupportPageData = {
      ...mayaSupportPageData,
      cases: CASE_STATUSES.map((status, index) => ({ ...mayaSupportPageData.cases[0]!, id: `case_${status}`, status, viewerRole: undefined, kind: MEMBER_CASE_KINDS[index % MEMBER_CASE_KINDS.length]!, unread: false })),
    };
    mount(data);
    for (const topic of SUPPORT_TOPICS) expect(screen.getByRole('radio', { name: messages.support.topics[topic] })).toBeVisible();
    const cases = within(screen.getByRole('region', { name: messages.support.cases }));
    for (const kind of MEMBER_CASE_KINDS) expect(cases.getAllByText(messages.support.kinds[kind]).length).toBeGreaterThan(0);
    for (const status of CASE_STATUSES) expect(cases.getByText(messages.status.case[status])).toBeVisible();
  });

  it('requires a topic, focuses it, then enforces description limits before calling the handler', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    await waitFor(() => expect(screen.getAllByRole('radio')[0]).toHaveFocus());
    expect(screen.getByRole('radiogroup', { name: messages.support.topic })).toHaveAttribute('aria-invalid', 'true');
    await fill(user, 'Too short');
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(2001) } });
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    expect(await screen.findByText(messages.forms.fieldErrors.too_long)).toBeVisible();
    expect(handlers.onCreate).not.toHaveBeenCalled();
  });

  it('submits a trimmed request without a booking or photos and follows redirectTo', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await fill(user, `  ${description}  `);
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledExactlyOnceWith({ topic: 'payment', bookingId: undefined, description, photoIds: [] }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(success.redirectTo);
    expect(screen.getByText(messages.support.success)).toBeVisible();
    expect(screen.getByRole('button', { name: messages.support.submit })).toBeDisabled();
  });

  it('submits the selected booking and uploaded photo ids, limiting a batch to four photos', async () => {
    const user = userEvent.setup();
    const photos = Array.from({ length: 4 }, (_, index) => ({ ...uploadedTaskPhotos[0]!, id: `support_photo_${index}` }));
    let uploadIndex = 0;
    const onUploadPhoto = vi.fn<SupportHandlers['onUploadPhoto']>(async () => ({ ok: true, photo: photos[uploadIndex++]! }));
    const { handlers } = mount(undefined, { onUploadPhoto });
    await fill(user);
    await user.selectOptions(screen.getByRole('combobox'), mayaSupportPageData.bookings[0]!.id);
    const files = Array.from({ length: 5 }, (_, index) => new File(['photo'], `photo-${index}.jpg`, { type: 'image/jpeg' }));
    await user.upload(screen.getByLabelText(messages.support.photos), files);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));
    expect(onUploadPhoto).toHaveBeenCalledTimes(4);
    expect(onUploadPhoto.mock.calls[0]![0].get('file')).toBe(files[0]);
    expect(screen.getByText(photoCopy('errors.too_many', { maximum: 4 }))).toBeVisible();
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledExactlyOnceWith({ topic: 'payment', bookingId: mayaSupportPageData.bookings[0]!.id, description, photoIds: photos.map((photo) => photo.id) }));
    expect(navigation.push).toHaveBeenCalledWith(success.redirectTo);
  });

  it('disables submission during photo upload and sends the photo only after it succeeds', async () => {
    const user = userEvent.setup();
    let resolve!: (result: PhotoUploadResult) => void;
    const onUploadPhoto = vi.fn<SupportHandlers['onUploadPhoto']>(() => new Promise((done) => { resolve = done; }));
    const { handlers } = mount(undefined, { onUploadPhoto });
    await fill(user);
    await user.upload(screen.getByLabelText(messages.support.photos), new File(['photo'], 'desk.jpg', { type: 'image/jpeg' }));
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: messages.support.submit })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    expect(handlers.onCreate).not.toHaveBeenCalled();
    await act(async () => { resolve({ ok: true, photo: uploadedTaskPhotos[0]! }); });
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledWith({ topic: 'payment', bookingId: undefined, description, photoIds: [uploadedTaskPhotos[0]!.id] }));
  });

  it('prevents duplicate submissions while pending, retains input on failure and focuses the server field error', async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const onCreate = vi.fn<SupportHandlers['onCreate']>(() => new Promise((done) => { resolve = done; }));
    mount(undefined, { onCreate });
    await fill(user);
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: messages.support.submitting })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    expect(onCreate).toHaveBeenCalledOnce();
    await act(async () => { resolve({ ok: false, code: 'validation_failed', fieldErrors: { description: ['too_short'] } }); });
    expect(await screen.findByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    expect(screen.getByRole('textbox')).toHaveValue(description);
    expect(screen.getByRole('radio', { name: messages.support.topics.payment })).toBeChecked();
    expect(screen.getByRole('button', { name: messages.support.submit })).not.toBeDisabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('handles a thrown create failure and allows a successful retry', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn<SupportHandlers['onCreate']>().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(success);
    mount(undefined, { onCreate });
    await fill(user);
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: messages.support.submit }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(success.redirectTo));
  });

  it.each(ACTION_ERROR_CODES)('shows friendly feedback for action error %s', (code) => {
    const handlers: SupportHandlers = { onCreate: vi.fn(), onUploadPhoto: vi.fn() };
    render(<NextIntlClientProvider locale="en" messages={messages}><SupportContent data={supportEmptyData} handlers={handlers} now={now} initialResult={{ ok: false, code }} /></NextIntlClientProvider>);
    const expected = code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(expected)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
