/** @vitest-environment jsdom */
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoUploadResult } from '@/contracts';
import { deskCompletionView } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { EvidencePhotoPicker, type EvidencePhotoPickerProps } from './evidence-photo-picker';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const copy = createTranslator({ locale: 'en', messages, namespace: 'bookingComplete.photos' });
const first = deskCompletionView.photos[0]!;
const second = deskCompletionView.photos[1]!;
const file = (name = 'desk.jpg', type = 'image/jpeg') => new File(['photo'], name, { type });

function ControlledPicker(props: EvidencePhotoPickerProps) {
  const [photos, setPhotos] = useState(props.photos);
  return <EvidencePhotoPicker {...props} photos={photos} onChange={(next) => { setPhotos(next); props.onChange(next); }} />;
}

function mount(overrides: Partial<EvidencePhotoPickerProps> = {}) {
  const props: EvidencePhotoPickerProps = {
    id: 'evidence-photos',
    label: messages.bookingComplete.photos.label,
    hint: copy('hint', { minimum: 0, maximum: 6, megabytes: 10 }),
    photos: [],
    maxPhotos: 6,
    maxPhotoMegabytes: 10,
    onChange: vi.fn(),
    onBusyChange: vi.fn(),
    onUploadPhoto: vi.fn<EvidencePhotoPickerProps['onUploadPhoto']>().mockResolvedValue({ ok: true, photo: first }),
    ...overrides,
  };
  return { props, ...render(<NextIntlClientProvider locale="en" messages={messages}><ControlledPicker {...props} /></NextIntlClientProvider>) };
}

const input = () => screen.getByLabelText(messages.bookingComplete.photos.label);

describe('EvidencePhotoPicker', () => {
  it('rejects an oversized file before calling the upload handler', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    const oversized = file();
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    await user.upload(input(), oversized);
    expect(screen.getByRole('alert')).toHaveTextContent(copy('errors.too_large', { megabytes: 10 }));
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(props.onUploadPhoto).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(input()).not.toBeDisabled();
  });

  it('accepts a photo exactly at the maximum size', async () => {
    const user = userEvent.setup();
    const { props } = mount();
    const maximumSize = file();
    Object.defineProperty(maximumSize, 'size', { value: 10 * 1024 * 1024 });
    await user.upload(input(), maximumSize);
    await waitFor(() => expect(props.onChange).toHaveBeenCalledExactlyOnceWith([first]));
    expect(props.onUploadPhoto).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects unsupported file types before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { props } = mount();
    await user.upload(input(), file('receipt.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent(copy('errors.unsupported_type'));
    expect(props.onUploadPhoto).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])('accepts supported photo type %s', async (type) => {
    const user = userEvent.setup();
    const { props } = mount();
    await user.upload(input(), file('work-photo', type));
    await waitFor(() => expect(props.onChange).toHaveBeenCalledExactlyOnceWith([first]));
  });

  it('stops a selected batch at the photo limit and rejects another file without uploading it', async () => {
    const user = userEvent.setup();
    const onUploadPhoto = vi.fn<EvidencePhotoPickerProps['onUploadPhoto']>().mockResolvedValue({ ok: true, photo: second });
    const { props } = mount({ photos: [first], maxPhotos: 2, onUploadPhoto });
    await user.upload(input(), [file('one.jpg'), file('two.jpg')]);
    expect(onUploadPhoto).toHaveBeenCalledOnce();
    expect(props.onChange).toHaveBeenCalledExactlyOnceWith([first, second]);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent(copy('errors.too_many', { maximum: 2 }));
    await user.upload(input(), file('three.jpg'));
    expect(onUploadPhoto).toHaveBeenCalledOnce();
  });

  it.each(['too_large', 'unsupported_type', 'too_many', 'rate_limited', 'unknown'] as const)('shows %s upload errors while keeping existing photos', async (code) => {
    const user = userEvent.setup();
    const onUploadPhoto = vi.fn<EvidencePhotoPickerProps['onUploadPhoto']>().mockResolvedValue({ ok: false, code });
    const { props } = mount({ photos: [first], onUploadPhoto });
    await user.upload(input(), file());
    expect(await screen.findByRole('alert')).toHaveTextContent(copy(`errors.${code}`, { maximum: 6, megabytes: 10 }));
    expect(screen.getByRole('img')).toHaveAccessibleName(first.alt);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(input()).not.toBeDisabled();
  });

  it('handles rejected uploads as unknown errors and permits a retry', async () => {
    const user = userEvent.setup();
    const onUploadPhoto = vi.fn<EvidencePhotoPickerProps['onUploadPhoto']>()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ ok: true, photo: first });
    const { props } = mount({ onUploadPhoto });
    const selected = file();
    await user.upload(input(), selected);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy('errors.unknown'));
    await user.upload(input(), selected);
    await waitFor(() => expect(props.onChange).toHaveBeenCalledExactlyOnceWith([first]));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(copy('uploaded'));
  });

  it('removes the selected photo and announces removal', async () => {
    const user = userEvent.setup();
    const { props } = mount({ photos: [first, second] });
    await user.click(screen.getByRole('button', { name: copy('remove', { number: 1 }) }));
    expect(props.onChange).toHaveBeenCalledExactlyOnceWith([second]);
    expect(screen.getByRole('img')).toHaveAccessibleName(second.alt);
    expect(screen.getByRole('status')).toHaveTextContent(copy('removed'));
    expect(props.onUploadPhoto).not.toHaveBeenCalled();
  });

  it('locks selection and removal across the whole batch, then returns every uploaded photo', async () => {
    const user = userEvent.setup();
    const resolvers: Array<(result: PhotoUploadResult) => void> = [];
    const onUploadPhoto = vi.fn<EvidencePhotoPickerProps['onUploadPhoto']>(() => new Promise((resolve) => { resolvers.push(resolve); }));
    const third = { ...second, id: 'ph_additional_evidence' };
    const { props } = mount({ photos: [first], onUploadPhoto });
    const one = file('one.jpg');
    const two = file('two.jpg');
    await user.upload(input(), [one, two]);
    expect(input()).toBeDisabled();
    expect(screen.getByRole('button', { name: copy('remove', { number: 1 }) })).toBeDisabled();
    expect(props.onBusyChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(onUploadPhoto.mock.calls[0]![0].get('file')).toBe(one);
    // Even a duplicate change event cannot start another batch while pending.
    fireEvent.change(input(), { target: { files: [file('duplicate.jpg')] } });
    expect(onUploadPhoto).toHaveBeenCalledOnce();
    await act(async () => { resolvers[0]!({ ok: true, photo: second }); });
    expect(input()).toBeDisabled();
    expect(onUploadPhoto).toHaveBeenCalledTimes(2);
    expect(onUploadPhoto.mock.calls[1]![0].get('file')).toBe(two);
    expect(props.onBusyChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(props.onChange).toHaveBeenNthCalledWith(1, [first, second]);
    await act(async () => { resolvers[1]!({ ok: true, photo: third }); });
    expect(props.onChange).toHaveBeenNthCalledWith(2, [first, second, third]);
    expect(props.onBusyChange).toHaveBeenNthCalledWith(2, false);
    expect(input()).not.toBeDisabled();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('respects the parent disabled state for both selection and removal', () => {
    mount({ photos: [first], disabled: true });
    expect(input()).toBeDisabled();
    expect(screen.getByRole('button', { name: copy('remove', { number: 1 }) })).toBeDisabled();
  });
});
