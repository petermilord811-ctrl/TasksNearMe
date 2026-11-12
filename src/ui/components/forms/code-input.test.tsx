/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en/ui';
import { CodeInput } from './code-input';

afterEach(cleanup);

function Harness({ onComplete, invalid = false, disabled = false }: { onComplete?: (code: string) => void; invalid?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <label htmlFor="code">6-digit code</label>
      <CodeInput id="code" value={value} onChange={setValue} onComplete={onComplete} invalid={invalid} disabled={disabled} describedBy="code-hint" />
      <p id="code-hint">Enter all 6 digits.</p>
    </NextIntlClientProvider>
  );
}

const field = () => screen.getByLabelText('6-digit code');
/** The six visual boxes (hidden from assistive tech; the real input carries the value). */
const boxes = (container: HTMLElement) => Array.from(container.querySelectorAll('[aria-hidden="true"] > div')).map((box) => box.textContent ?? '');

describe('CodeInput', () => {
  it('is one numeric one-time-code field for keyboards, autofill and screen readers', () => {
    render(<Harness />);
    const input = field();
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('maxlength', '6');
    expect(input).toHaveAccessibleDescription('Enter all 6 digits.');
  });

  it('draws each typed digit in its box and drops anything that is not a digit', async () => {
    const { container } = render(<Harness />);
    await userEvent.type(field(), '1a2 3-');
    expect(field()).toHaveValue('123');
    expect(boxes(container)).toEqual(['1', '2', '3', '', '', '']);
  });

  it('runs onComplete once when the sixth digit arrives, and again only for a new code', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.type(field(), '123456');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
    await userEvent.type(field(), '7');
    expect(field()).toHaveValue('123456');
    expect(onComplete).toHaveBeenCalledOnce();
    await userEvent.type(field(), '{Backspace}9');
    expect(onComplete).toHaveBeenLastCalledWith('123459');
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('takes a pasted code with spaces or dashes', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(field(), { clipboardData: { getData: () => ' 123-456 ' } });
    expect(field()).toHaveValue('123456');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it('focuses the field from a click anywhere on the boxes', async () => {
    const { container } = render(<Harness />);
    await userEvent.click(container.querySelector('[aria-hidden="true"]')!);
    expect(field()).toHaveFocus();
  });

  it('marks the field invalid and can be disabled', () => {
    render(<Harness invalid disabled />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toBeDisabled();
  });
});
