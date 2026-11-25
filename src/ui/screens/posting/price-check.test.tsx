/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { FormProvider, useForm } from 'react-hook-form';
import type { AiAssistResult, PriceCheck, TaskDraftInput } from '@/contracts';
import { deskDraft, priceCheckBelow, priceCheckNoBudget, priceCheckResult, priceCheckWithin } from '@/fixtures';
import { formatMoney, formatMoneyShort } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { PriceCheckCard, PriceCheckView } from './price-check';

afterEach(cleanup);

const copy = messages.postTask.priceCheck;

function Providers({ children, values = deskDraft }: { children: ReactNode; values?: TaskDraftInput }) {
  const form = useForm<TaskDraftInput>({ defaultValues: values });
  return <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages} onError={(error) => { throw error; }}><FormProvider {...form}>{children}</FormProvider></NextIntlClientProvider>;
}

describe('the price check, as it reads', () => {
  it("shows the range for the job's size, where the price sits, why, and recent bookings", () => {
    render(<Providers><PriceCheckView market="Austin" state={{ kind: 'checked', check: priceCheckWithin }} /></Providers>);
    // Whole dollars: the range is the guide rounded to $5.
    expect(screen.getByText(`Fair for this job: ${formatMoneyShort(11000)}–${formatMoneyShort(15000)}`)).toBeVisible();
    expect(screen.getByText('Fair for this job: $110–$150')).toBeVisible();
    expect(screen.getByText('For 2 items')).toBeVisible();
    expect(screen.getByText(`Your price, ${formatMoney(12000)}, is in this range.`)).toBeVisible();
    expect(screen.getByText(priceCheckWithin.reasons[0]!)).toBeVisible();
    expect(screen.getByText(/Recent bookings for this service in Austin/)).toHaveTextContent('(12 bookings)');
    expect(screen.getByText(copy.checkedWithAi)).toBeVisible();
  });

  it('asks for a price when there is none, and says when it is under the range', () => {
    render(<Providers><PriceCheckView market="Austin" state={{ kind: 'checked', check: priceCheckNoBudget }} /></Providers>);
    expect(screen.getByText(copy.noBudget)).toBeVisible();
    expect(screen.getByText('For about 3 hours')).toBeVisible();
    cleanup();
    render(<Providers><PriceCheckView market="Austin" state={{ kind: 'checked', check: priceCheckBelow }} /></Providers>);
    expect(screen.getByText(/is under this range/)).toBeVisible();
  });
});

describe('Check my price with AI', () => {
  it('sends what the form holds (no blanks), and shows the answer', async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn(async (): Promise<AiAssistResult<PriceCheck>> => priceCheckResult(priceCheckWithin));
    render(<Providers><PriceCheckCard market="Austin" onCheck={onCheck} /></Providers>);
    await user.click(screen.getByRole('button', { name: copy.check }));
    expect(onCheck).toHaveBeenCalledExactlyOnceWith({
      categorySlug: 'furniture-assembly',
      title: deskDraft.title,
      description: deskDraft.description,
      details: deskDraft.details,
      budget: { type: 'fixed', priceCents: 6000 },
    });
    expect(await screen.findByText(/Fair for this job/)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.again })).toBeVisible();
  });

  it('asks for words first, and says why a check could not run', async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn(async (): Promise<AiAssistResult<PriceCheck>> => ({ ok: false, code: 'unavailable' }));
    render(<Providers values={{ ...deskDraft, description: 'desk' }}><PriceCheckCard market="Austin" onCheck={onCheck} /></Providers>);
    await user.click(screen.getByRole('button', { name: copy.check }));
    expect(await screen.findByText(copy.needsWords)).toBeVisible();
    expect(onCheck).not.toHaveBeenCalled();
    cleanup();
    render(<Providers><PriceCheckCard market="Austin" onCheck={onCheck} /></Providers>);
    await user.click(screen.getByRole('button', { name: copy.check }));
    expect(await screen.findByText(copy.errors.unavailable)).toBeVisible();
  });
});
