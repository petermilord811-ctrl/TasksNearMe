/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { CATEGORY_DETAIL_FIELDS, type CategorySlug, type TaskDraftInput } from '@/contracts';
import { deskDraft, postTaskPageData, remoteHelpDraft } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CategoryStep } from './category-step';
import { DetailsStep } from './details-step';
import { BudgetStep } from './budget-step';
import { ScheduleStep } from './schedule-step';

afterEach(cleanup);

function FormHarness({ children, values = deskDraft }: { children: ReactNode; values?: TaskDraftInput }) {
  const form = useForm<TaskDraftInput>({ defaultValues: values });
  const currentValues = useWatch({ control: form.control });
  return <NextIntlClientProvider locale="en" messages={messages}><FormProvider {...form}><form>{children}<output data-testid="draft">{JSON.stringify(currentValues)}</output></form></FormProvider></NextIntlClientProvider>;
}

function draft() { return JSON.parse(screen.getByTestId('draft').textContent!) as TaskDraftInput; }

describe('posting fields and copy', () => {
  for (const category of Object.keys(CATEGORY_DETAIL_FIELDS) as CategorySlug[]) {
    it(`renders every ${category} detail with labels, hints, and option copy`, () => {
      const copy = messages.postTask.details[category] as Record<string, { label: string; hint: string; options?: Record<string, string> }>;
      render(<FormHarness values={{ ...deskDraft, categorySlug: category, details: {} }}><DetailsStep category={category} /></FormHarness>);
      for (const field of CATEGORY_DETAIL_FIELDS[category]) {
        const text = copy[field.key]!;
        expect(text.label).toBeTruthy();
        expect(text.hint).toBeTruthy();
        const input = field.kind === 'yes_no'
          ? screen.getByRole('radiogroup', { name: text.label })
          : screen.getByLabelText(field.required ? text.label : `${text.label} (optional)`);
        expect(input).toBeInTheDocument();
        expect(input).toHaveAccessibleDescription(new RegExp(text.hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        if (field.kind === 'choice') {
          for (const option of field.options) expect(screen.getByRole('option', { name: text.options![option] })).toHaveValue(option);
        }
      }
    });
  }

  it('keeps copy free of the posting ticket banned vocabulary', () => {
    expect(JSON.stringify(messages.postTask)).not.toMatch(/\b(hire|wages|employer)\b/i);
  });

  it('changes category defaults and clears category-specific details without posting', async () => {
    const user = userEvent.setup();
    render(<FormHarness values={remoteHelpDraft}><CategoryStep data={postTaskPageData} /></FormHarness>);
    await user.click(screen.getByRole('radio', { name: /Moving help/ }));
    expect(draft()).toMatchObject({ categorySlug: 'moving-help', details: {}, location: { mode: 'local', placeId: '' }, budget: { type: 'hourly', rateCents: 0, estimatedHours: 2, hoursCap: 2 } });
  });

  it('parses dollar input into cents and gives an invalid error for extra decimals', async () => {
    const user = userEvent.setup();
    render(<FormHarness><BudgetStep data={postTaskPageData} /></FormHarness>);
    const input = screen.getByRole('textbox', { name: 'Task price ($)' });
    await user.clear(input);
    await user.type(input, '$60');
    expect(draft().budget).toEqual({ type: 'fixed', priceCents: 6000 });
    expect(input).toHaveValue('$60');
    await user.clear(input);
    await user.type(input, '12.345');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(draft().budget).toEqual({ type: 'fixed', priceCents: -1 });
    expect(screen.getByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '60.50');
    expect(draft().budget).toEqual({ type: 'fixed', priceCents: 6050 });
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('keeps empty hourly fields finite and shows invalid numeric sentinels as blank on remount', async () => {
    const user = userEvent.setup();
    const view = render(<FormHarness><BudgetStep data={postTaskPageData} /></FormHarness>);
    await user.click(screen.getByRole('radio', { name: 'Hourly' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'Estimated hours' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'Hour cap' }));
    expect(draft().budget).toMatchObject({ type: 'hourly', estimatedHours: -1, hoursCap: -1 });
    const values: TaskDraftInput = { ...deskDraft, budget: { type: 'hourly', rateCents: -1, estimatedHours: -1, hoursCap: -1 } };
    view.unmount();
    render(<FormHarness values={values}><BudgetStep data={postTaskPageData} /></FormHarness>);
    expect(screen.getByRole('textbox', { name: 'Hourly rate ($)' })).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Estimated hours' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Hour cap' })).toHaveValue(null);
  });

  it('sets market date display bounds and clears window values for a flexible day', async () => {
    const user = userEvent.setup();
    render(<FormHarness><ScheduleStep data={postTaskPageData} /></FormHarness>);
    expect(screen.getByLabelText('Date')).toHaveAttribute('min', '2026-11-17');
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-12-01');
    const startOptions = within(screen.getByLabelText('Window starts')).getAllByRole('option');
    expect(startOptions).toHaveLength(49);
    expect(startOptions[1]).toHaveValue('00:00');
    expect(startOptions[2]).toHaveValue('00:30');
    expect(startOptions[48]).toHaveValue('23:30');
    await user.click(screen.getByRole('radio', { name: 'Any time that day' }));
    expect(draft().schedule).toEqual({ date: '2026-11-21', flexible: true });
    expect(screen.queryByLabelText('Window starts')).not.toBeInTheDocument();
  });
});
