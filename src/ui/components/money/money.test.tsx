/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import uiMessages from '../../../../messages/en/ui';
import { Money } from './money';

afterEach(cleanup);

describe('Money', () => {
  it('uses the true minus sign and two decimals for a negative amount', () => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><Money cents={-600} /></NextIntlClientProvider>);
    expect(screen.getByText('−$6.00')).toBeInTheDocument();
  });

  it('can display a positive change without giving zero a plus sign', () => {
    render(
      <NextIntlClientProvider locale="en" messages={uiMessages}>
        <Money cents={2200} signDisplay="always" />
        <Money cents={0} signDisplay="always" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('+$22.00')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });
});
