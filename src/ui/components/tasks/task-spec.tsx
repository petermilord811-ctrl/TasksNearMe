import { Check, Hash, ListChecks, Type, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_DETAIL_FIELDS, type CategorySlug } from '@/contracts';
import { cn } from '@/ui/lib/utils';

const KIND_ICONS = { choice: ListChecks, count: Hash, text: Type } as const;

type SpecRow = { key: string; label: string; yesNo: boolean } | { key: string; label: string; display: string; Icon: (typeof KIND_ICONS)[keyof typeof KIND_ICONS] };

/**
 * A task's answers to its category's questions as a spec sheet (2026-11-23, the structured task page): each answer a
 * tile with its question, choices and counts in words, yes and no as a mark. Unanswered questions are left out; nothing
 * when none was answered.
 */
export function TaskSpec({ category, answers, className }: { category: CategorySlug; answers: Record<string, string | number | boolean>; className?: string }) {
  const t = useTranslations('postTask');
  const rows = CATEGORY_DETAIL_FIELDS[category].flatMap((field): SpecRow[] => {
    const value = answers[field.key];
    if (value === undefined || value === '') return [];
    const label = t(`details.${category}.${field.key}.label`);
    if (field.kind === 'yes_no' && typeof value === 'boolean') return [{ key: field.key, label, yesNo: value }];
    const display = field.kind === 'choice' && typeof value === 'string' && field.options.includes(value) ? t(`details.${category}.${field.key}.options.${value}`) : String(value);
    return [{ key: field.key, label, display, Icon: KIND_ICONS[field.kind === 'yes_no' ? 'text' : field.kind] }];
  });
  if (rows.length === 0) return null;
  return <dl className={cn('grid gap-2.5 sm:grid-cols-2', className)}>
    {/* Each answer a <div> of one <dt> and one <dd> (axe: definition-list), the mark drawn inside the <dt>. */}
    {rows.map((row) => <div key={row.key} className="relative min-w-0 rounded-2xl border border-foreground/[0.07] bg-background/60 py-3 pr-3.5 pl-[3.25rem] dark:border-white/[0.06]">
      <dt className="text-[13px] leading-5 text-muted-foreground">
        {'yesNo' in row
          ? <span aria-hidden="true" className={cn('absolute top-3 left-3.5 grid size-7 place-items-center rounded-full', row.yesNo ? 'bg-success/15 text-success' : 'bg-foreground/[0.06] text-muted-foreground')}>{row.yesNo ? <Check className="size-4" /> : <X className="size-4" />}</span>
          : <span aria-hidden="true" className="absolute top-3 left-3.5 grid size-7 place-items-center rounded-full bg-brand-soft text-primary"><row.Icon className="size-3.5" /></span>}
        {row.label}
      </dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{'yesNo' in row ? t(row.yesNo ? 'review.yes' : 'review.no') : row.display}</dd>
    </div>)}
  </dl>;
}
