import type { ProposeChangeInput, ProposeChangePageData } from '@/contracts';

export function changeDefaults(data: ProposeChangePageData): ProposeChangeInput {
  const { current } = data;
  return {
    ...(current.pricing.type === 'fixed' ? { priceCents: current.pricing.priceCents } : { hourlyRateCents: current.pricing.rateCents, hoursCap: current.pricing.hoursCap }),
    start: current.start,
    scopeText: current.scopeText,
    expenseAllowanceCents: current.expenseAllowanceCents,
    message: '',
  };
}

/** Only allowed, edited fields leave the form. No pricing or availability rules live here. */
export function changedInput(data: ProposeChangePageData, values: ProposeChangeInput): ProposeChangeInput {
  const defaults = changeDefaults(data);
  const result: ProposeChangeInput = { message: values.message };
  if (data.allowedTypes.includes('price')) {
    if (data.current.pricing.type === 'fixed' && values.priceCents !== defaults.priceCents) result.priceCents = values.priceCents;
    if (data.current.pricing.type === 'hourly' && values.hourlyRateCents !== defaults.hourlyRateCents) result.hourlyRateCents = values.hourlyRateCents;
  }
  if (data.allowedTypes.includes('hours_cap') && data.current.pricing.type === 'hourly' && values.hoursCap !== defaults.hoursCap) result.hoursCap = values.hoursCap;
  if (data.allowedTypes.includes('scope') && values.scopeText?.trim() !== defaults.scopeText?.trim()) result.scopeText = values.scopeText;
  if (data.allowedTypes.includes('expense_allowance') && values.expenseAllowanceCents !== defaults.expenseAllowanceCents) result.expenseAllowanceCents = values.expenseAllowanceCents;
  if (data.allowedTypes.includes('schedule') && new Date(values.start ?? '').getTime() !== new Date(defaults.start!).getTime()) result.start = values.start;
  return result;
}

export function startOutsideWindow(data: ProposeChangePageData, input: ProposeChangeInput) {
  if (!input.start || !data.scheduleWindow) return false;
  const start = new Date(input.start).getTime();
  return start < new Date(data.scheduleWindow.earliest).getTime() || start > new Date(data.scheduleWindow.latest).getTime();
}
