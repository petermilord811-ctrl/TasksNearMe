/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import uiMessages from '../../../../messages/en/ui';
import { CopyCodeScreen, readCopyCodeFragment } from './copy-code-screen';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/code');
});

function renderAt(hash: string) {
  window.history.replaceState(null, '', `/code${hash}`);
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><CopyCodeScreen /></NextIntlClientProvider>);
}
const inMinutes = (minutes: number) => Math.floor((Date.now() + minutes * 60_000) / 1000);

describe('reading the copy-code link', () => {
  it('takes the code and its expiry from the fragment', () => {
    expect(readCopyCodeFragment('#c=482915&e=1794634800')).toEqual({ code: '482915', expiresAt: 1794634800000 });
  });

  it('refuses anything that is not a six-digit code with a whole-second expiry', () => {
    for (const hash of ['', '#', '#c=48291&e=1794634800', '#c=abcdef&e=1794634800', '#c=482915', '#c=482915&e=-5', '#c=482915&e=1.5']) {
      expect(readCopyCodeFragment(hash)).toBeNull();
    }
  });
});

describe('the copy-code page', () => {
  it('shows the code, copies it with one tap, and wipes it from the address bar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt(`#c=482915&e=${inMinutes(10)}`);

    expect(await screen.findByText('482915')).toBeInTheDocument();
    expect(screen.getByText('Works for 10 more minutes')).toBeInTheDocument();
    expect(window.location.hash).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('482915'));
    expect(await screen.findByText('Copied. Paste it on the sign-in page.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign-in' })).toHaveAttribute('href', '/sign-in');
  });

  it('selects the code when the browser refuses to copy', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    renderAt(`#c=731004&e=${inMinutes(5)}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText(/Couldn't copy it here/)).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe('731004');
  });

  it('says when the code has expired, without showing it', async () => {
    renderAt(`#c=482916&e=${inMinutes(-1)}`);
    expect(await screen.findByRole('heading', { name: 'This code has expired' })).toBeInTheDocument();
    expect(screen.queryByText('482916')).toBeNull();
  });

  it('explains a link without a code', async () => {
    renderAt('#c=oops');
    expect(await screen.findByRole('heading', { name: "There's no code here" })).toBeInTheDocument();
  });
});
