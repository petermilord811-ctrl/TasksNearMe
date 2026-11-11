import { CATEGORY_SLUGS, POST_TASK_STEPS, type AddressSuggestion, type PostTaskStep, type TaskDraftInput } from '@/contracts';

export const draftStorageKey = (market: string) => `tasksnearme:post-task:${market}:v1`;

export interface StoredTaskDraft { values: TaskDraftInput; step: PostTaskStep; address?: AddressSuggestion }

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

/** Check storage structure, not task validity: unfinished drafts must survive a refresh. */
export function readStoredDraft(raw: string): StoredTaskDraft | undefined {
  const saved: unknown = JSON.parse(raw);
  if (!object(saved) || !POST_TASK_STEPS.includes(saved.step as PostTaskStep) || !object(saved.values)) return;
  const value = saved.values;
  if (value.categorySlug !== undefined && !CATEGORY_SLUGS.includes(value.categorySlug as TaskDraftInput['categorySlug'])) return;
  if (typeof value.title !== 'string' || typeof value.description !== 'string' || !object(value.details)) return;
  if (!Object.values(value.details).every((v) => ['string', 'boolean'].includes(typeof v) || number(v))) return;
  if (!Array.isArray(value.photoIds) || !value.photoIds.every((id) => typeof id === 'string')) return;
  if (!object(value.location) || !['local', 'remote'].includes(String(value.location.mode))) return;
  if (value.location.mode === 'local' && (typeof value.location.placeId !== 'string' || [value.location.unit, value.location.accessNotes].some((v) => v !== undefined && typeof v !== 'string'))) return;
  if (!object(value.schedule) || typeof value.schedule.date !== 'string' || typeof value.schedule.flexible !== 'boolean') return;
  if ([value.schedule.startTime, value.schedule.endTime].some((v) => v !== undefined && typeof v !== 'string')) return;
  if (!object(value.budget)) return;
  if (value.budget.type === 'fixed' ? !number(value.budget.priceCents) : value.budget.type !== 'hourly' || ![value.budget.rateCents, value.budget.estimatedHours, value.budget.hoursCap].every(number)) return;
  if (value.expenseAllowance !== undefined && (!object(value.expenseAllowance) || !number(value.expenseAllowance.amountCents) || typeof value.expenseAllowance.description !== 'string')) return;
  let address: AddressSuggestion | undefined;
  if (object(saved.address) && typeof saved.address.placeId === 'string' && typeof saved.address.line1 === 'string' && typeof saved.address.line2 === 'string' && saved.address.inServiceArea === true && (saved.address.areaName === undefined || typeof saved.address.areaName === 'string')) {
    address = saved.address as unknown as AddressSuggestion;
  }
  return { values: value as TaskDraftInput, step: saved.step as PostTaskStep, address };
}
