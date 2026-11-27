'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  PROFILE_LIST_LIMITS,
  helperExperienceInputSchema,
  helperPreferencesInputSchema,
  type ActionHandler,
  type ActionResult,
  type ExperienceEntry,
  type HelperExperienceInput,
  type HelperPreferencesInput,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/**
 * The profile's lists (2026-11-27): skills, the work they enjoy and the work they don't do as chips, and their experience
 * as a short list of jobs. Often filled from their resume ("Import from resume"); edited here by hand.
 */

type ListKey = keyof HelperPreferencesInput;

/** Words typed into a field become a chip on Enter or comma; × takes one off. */
export function ChipInput({ label, hint, items, max, length, tone = 'neutral', onChange }: {
  label: string;
  hint?: string;
  items: string[];
  max: number;
  length: number;
  tone?: 'neutral' | 'positive' | 'negative';
  onChange: (items: string[]) => void;
}) {
  const t = useTranslations('helperProfileEditor.lists');
  const id = useId();
  const [draft, setDraft] = useState('');
  const full = items.length >= max;
  function add() {
    const value = draft.trim().replace(/,+$/, '').slice(0, length);
    if (!value) return;
    if (!items.some((item) => item.toLowerCase() === value.toLowerCase()) && !full) onChange([...items, value]);
    setDraft('');
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && !draft && items.length > 0) {
      onChange(items.slice(0, -1));
    }
  }
  const chip = { neutral: 'bg-foreground/[0.06]', positive: 'bg-success/12 text-foreground', negative: 'bg-destructive/10 text-foreground' }[tone];
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
      {items.map((item) => <span key={item} className={cn('inline-flex max-w-full items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm', chip)}>
        <span className="min-w-0 truncate">{item}</span>
        <button type="button" onClick={() => onChange(items.filter((other) => other !== item))} className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring">
          <X aria-hidden="true" className="size-3.5" /><span className="sr-only">{t('remove', { item })}</span>
        </button>
      </span>)}
      <input
        id={id}
        value={draft}
        disabled={full}
        maxLength={length}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={keyDown}
        onBlur={add}
        placeholder={full ? t('full') : t('placeholder')}
        className="min-w-32 flex-1 bg-transparent px-2 py-1.5 text-[0.9375rem] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
    <p className="text-xs text-muted-foreground tabular-nums">{t('count', { count: items.length, max })}</p>
  </div>;
}

const firstCode = (result: ActionResult | undefined) => (result && !result.ok ? result : undefined);

export function PreferencesForm({ values, onSave }: { values: HelperPreferencesInput; onSave: ActionHandler<HelperPreferencesInput> }) {
  const t = useTranslations('helperProfileEditor.lists');
  const [lists, setLists] = useState<HelperPreferencesInput>(values);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const set = (key: ListKey) => (items: string[]) => setLists((current) => ({ ...current, [key]: items }));
  async function save() {
    const parsed = helperPreferencesInputSchema.safeParse(lists);
    if (!parsed.success) {
      setResult({ ok: false, code: 'validation_failed' });
      return;
    }
    setPending(true);
    const next = await onSave(parsed.data).catch((): ActionResult => ({ ok: false, code: 'unknown' }));
    setPending(false);
    setResult(next);
  }
  return <form noValidate className="space-y-6" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <ChipInput label={t('skills')} hint={t('skillsHint')} items={lists.skills} max={PROFILE_LIST_LIMITS.skills.items} length={PROFILE_LIST_LIMITS.skills.length} onChange={set('skills')} />
    <ChipInput label={t('likes')} hint={t('likesHint')} items={lists.likes} max={PROFILE_LIST_LIMITS.likes.items} length={PROFILE_LIST_LIMITS.likes.length} tone="positive" onChange={set('likes')} />
    <ChipInput label={t('excludes')} hint={t('excludesHint')} items={lists.excludes} max={PROFILE_LIST_LIMITS.excludes.items} length={PROFILE_LIST_LIMITS.excludes.length} tone="negative" onChange={set('excludes')} />
    <FormFeedback result={firstCode(result)} />
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending} aria-busy={pending}>{pending && <Spinner />}{t('save')}</Button>
  </form>;
}

const thisYear = () => new Date().getFullYear();

export function ExperienceForm({ values, onSave }: { values: HelperExperienceInput; onSave: ActionHandler<HelperExperienceInput> }) {
  const t = useTranslations('helperProfileEditor.experience');
  const id = useId();
  const [entries, setEntries] = useState<ExperienceEntry[]>(values.experience.length > 0 ? values.experience : []);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const [invalid, setInvalid] = useState<number[]>([]);
  const update = (index: number, patch: Partial<ExperienceEntry>) => setEntries((current) => current.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));
  const year = (value: string) => (value.trim() === '' ? undefined : Number.parseInt(value, 10));
  async function save() {
    const cleaned = entries.map((entry) => ({
      title: entry.title.trim(),
      ...(entry.organization?.trim() ? { organization: entry.organization.trim() } : {}),
      ...(entry.startYear !== undefined && !Number.isNaN(entry.startYear) ? { startYear: entry.startYear } : {}),
      ...(!entry.current && entry.endYear !== undefined && !Number.isNaN(entry.endYear) ? { endYear: entry.endYear } : {}),
      ...(entry.current ? { current: true } : {}),
      ...(entry.summary?.trim() ? { summary: entry.summary.trim() } : {}),
    }));
    const parsed = helperExperienceInputSchema.safeParse({ experience: cleaned });
    if (!parsed.success) {
      setInvalid([...new Set(parsed.error.issues.map((issue) => Number(issue.path[1])).filter((at) => !Number.isNaN(at)))]);
      setResult({ ok: false, code: 'validation_failed' });
      return;
    }
    setInvalid([]);
    setPending(true);
    const next = await onSave(parsed.data).catch((): ActionResult => ({ ok: false, code: 'unknown' }));
    setPending(false);
    setResult(next);
  }
  return <form noValidate className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    {entries.length === 0 && <p className="rounded-2xl bg-foreground/[0.03] p-4 text-sm text-muted-foreground">{t('empty')}</p>}
    <ol className="space-y-4">
      {entries.map((entry, index) => <li key={index} className={cn('space-y-3 rounded-2xl border p-4', invalid.includes(index) && 'border-destructive')}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t('entry', { number: index + 1 })}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEntries((current) => current.filter((_, at) => at !== index))}><Trash2 aria-hidden="true" />{t('remove')}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-${index}-title`} className="text-sm font-medium">{t('jobTitle')}</label>
            <Input id={`${id}-${index}-title`} value={entry.title} maxLength={80} onChange={(event) => update(index, { title: event.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-${index}-org`} className="text-sm font-medium">{t('organization')}</label>
            <Input id={`${id}-${index}-org`} value={entry.organization ?? ''} maxLength={80} onChange={(event) => update(index, { organization: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-${index}-start`} className="text-sm font-medium">{t('startYear')}</label>
            <Input id={`${id}-${index}-start`} inputMode="numeric" value={entry.startYear ?? ''} maxLength={4} placeholder={String(thisYear() - 2)} onChange={(event) => update(index, { startYear: year(event.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-${index}-end`} className="text-sm font-medium">{t('endYear')}</label>
            <Input id={`${id}-${index}-end`} inputMode="numeric" value={entry.current ? '' : (entry.endYear ?? '')} disabled={entry.current} maxLength={4} placeholder={entry.current ? t('present') : String(thisYear())} onChange={(event) => update(index, { endYear: year(event.target.value) })} />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2">
            <input type="checkbox" checked={entry.current === true} onChange={(event) => update(index, { current: event.target.checked, ...(event.target.checked ? { endYear: undefined } : {}) })} className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-ring" />
            {t('current')}
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-${index}-summary`} className="text-sm font-medium">{t('summary')}</label>
            <Textarea id={`${id}-${index}-summary`} value={entry.summary ?? ''} maxLength={280} rows={2} onChange={(event) => update(index, { summary: event.target.value })} />
          </div>
        </div>
        {invalid.includes(index) && <p role="alert" className="text-sm text-destructive">{t('invalid')}</p>}
      </li>)}
    </ol>
    {entries.length < PROFILE_LIST_LIMITS.experience.items && <Button type="button" variant="outline" onClick={() => setEntries((current) => [...current, { title: '' }])}><Plus aria-hidden="true" />{t('add')}</Button>}
    <FormFeedback result={firstCode(result)} />
    <div><Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending} aria-busy={pending}>{pending && <Spinner />}{t('save')}</Button></div>
  </form>;
}
