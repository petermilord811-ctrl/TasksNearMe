/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { MessageSegment } from '@/contracts';
import { maskedEmailMessage, maskedPhoneMessage, unmaskedMessage } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import location from '../../../../messages/en/ui/location.json';
import { MaskedText } from './masked-text';

afterEach(cleanup);

function renderMessage(segments: MessageSegment[], always = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ...uiMessages, location }}>
      <p data-testid="message"><MaskedText segments={segments} always={always} /></p>
    </NextIntlClientProvider>,
  );
}

describe('MaskedText', () => {
  it('keeps the app-provided phone hint while marking the contact as hidden', () => {
    renderMessage(maskedPhoneMessage);
    expect(screen.getByTestId('message')).toHaveTextContent('Happy to help! Text me at •••-•••-0134 (hidden until booking) if that’s easier.');
    expect(screen.getByTestId('message')).not.toHaveTextContent('512-555-0134');
  });

  it('masks email segments and supports phone segments without a hint', () => {
    renderMessage([...maskedEmailMessage, { kind: 'masked', detail: 'phone' }]);
    expect(screen.getByText('•••@••• (hidden until booking)')).toBeVisible();
    expect(screen.getByText('•••-•••-•••• (hidden until booking)')).toBeVisible();
  });

  it('says a hidden link or username shows once the booking is paid (abuse rehearsal J-AB1, J-AB2)', () => {
    renderMessage([{ kind: 'text', text: 'Pay here ' }, { kind: 'masked', detail: 'link' }, { kind: 'text', text: ' or ' }, { kind: 'masked', detail: 'handle' }]);
    expect(screen.getByText('link hidden (links show once the booking is paid)')).toBeVisible();
    expect(screen.getByText('@••• (usernames show once the booking is paid)')).toBeVisible();
  });

  it('in a building or street group, where no booking shows them, says only that they are hidden', () => {
    renderMessage([...maskedPhoneMessage, { kind: 'masked', detail: 'email' }, { kind: 'masked', detail: 'link' }, { kind: 'masked', detail: 'handle' }, { kind: 'masked', detail: 'phone' }], true);
    expect(screen.getByText('•••-•••-0134 (hidden)')).toBeVisible();
    expect(screen.getByText('•••@••• (hidden)')).toBeVisible();
    expect(screen.getByText('link hidden')).toBeVisible();
    expect(screen.getByText('@••• (hidden)')).toBeVisible();
    expect(screen.getByText('•••-•••-•••• (hidden)')).toBeVisible();
    expect(screen.getByTestId('message')).not.toHaveTextContent(/booking/);
  });

  it('renders allowed text unchanged rather than running its own contact detection', () => {
    const segments: MessageSegment[] = [...unmaskedMessage, { kind: 'text', text: ' Call 512-555-0134.' }];
    renderMessage(segments);
    expect(screen.getByTestId('message')).toHaveTextContent('See you Saturday at 10:30! Call 512-555-0134.');
    expect(screen.queryByText(/hidden until booking/)).not.toBeInTheDocument();
  });
});
