/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en/ui';
import { FileChooser } from './file-chooser';

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof FileChooser>[0]> = {}) {
  const onFiles = vi.fn();
  render(<NextIntlClientProvider locale="en" messages={messages}>
    <p id="photos-label">Photos</p>
    <p id="photos-hint">Up to 3 photos, 10 MB each.</p>
    <FileChooser id="photos" labelledBy="photos-label" describedBy="photos-hint" accept="image/png,image/jpeg" multiple onFiles={onFiles} {...props} />
  </NextIntlClientProvider>);
  return onFiles;
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('FileChooser', () => {
  it('keeps the real input focusable, named by the field label and described by its hint', async () => {
    const user = userEvent.setup();
    mount();
    const input = screen.getByLabelText('Photos');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAccessibleDescription('Up to 3 photos, 10 MB each.');
    await user.tab();
    expect(input).toHaveFocus();
    // The visible control is the button-styled label for the input.
    expect(screen.getByText(messages.forms.upload.choosePhotos).closest('label')).toHaveAttribute('for', 'photos');
  });

  it('hands over chosen files and clears the input so the same file can be chosen again', async () => {
    const user = userEvent.setup();
    const onFiles = mount();
    const input = screen.getByLabelText('Photos') as HTMLInputElement;
    await user.upload(input, [png('a.png'), png('b.png')]);
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.png' }), expect.objectContaining({ name: 'b.png' })]);
    expect(input.value).toBe('');
  });

  it('takes dropped files, unless disabled', () => {
    const onFiles = mount();
    const zone = screen.getByText(messages.forms.upload.choosePhotos).closest('div')!;
    fireEvent.dragOver(zone, { dataTransfer: { files: [png('c.png')] } });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.drop(zone, { dataTransfer: { files: [png('c.png')] } });
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'c.png' })]);
    cleanup();
    const off = mount({ disabled: true });
    const disabledZone = screen.getByText(messages.forms.upload.choosePhotos).closest('div')!;
    fireEvent.drop(disabledZone, { dataTransfer: { files: [png('d.png')] } });
    expect(off).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Photos')).toBeDisabled();
  });

  it('keeps one chosen file for a form that reads it on submit, and shows its name', async () => {
    const user = userEvent.setup();
    const onFiles = mount({ multiple: false, keepSelection: true, name: 'file' });
    const input = screen.getByLabelText('Photos') as HTMLInputElement;
    await user.upload(input, png('sample.png'));
    expect(input.files?.[0]?.name).toBe('sample.png');
    expect(screen.getByText('Chosen: sample.png')).toBeInTheDocument();
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'sample.png' })]);
  });
});
