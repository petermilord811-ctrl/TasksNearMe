'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, type ActionHandler, type ActionResult, type AdminAnnouncementRow, type AdminMarketRow, type AnnouncementEndInput, type AnnouncementInput, type BadgeTone } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormat } from '@/ui/lib/format';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { AdminReasonAction } from './admin-reason-action';
import { adminH2, adminSection } from './admin-ui';

const stateTones: Record<AdminAnnouncementRow['state'], BadgeTone> = { live: 'success', scheduled: 'info', ended: 'neutral' };

/**
 * Neighbors' pinned card (plan 10.16), on the config page: what shows now and what ended, and a form to pin a new one
 * to a market until a date, in English and Spanish, with the reason for the audit log. A new card replaces the market's
 * live one; members who close it don't see it again.
 */
export function AdminAnnouncementsSection({ rows, markets, onPublish, onEnd }: { rows: AdminAnnouncementRow[]; markets: AdminMarketRow[]; onPublish?: ActionHandler<AnnouncementInput>; onEnd?: ActionHandler<AnnouncementEndInput> }) {
  const t = useTranslations('adminConfig.announcements');
  const { formatDate } = useFormat();
  const id = useId();
  const open = markets.filter((market) => market.status !== 'paused');
  const [form, setForm] = useState<AnnouncementInput>({ marketId: open[0]?.id ?? markets[0]?.id ?? '', titleEn: '', bodyEn: '', titleEs: '', bodyEs: '', endsDate: '', reason: '' });
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const set = (key: keyof AnnouncementInput) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const errorOf = (key: keyof AnnouncementInput) => {
    const code = result && !result.ok ? result.fieldErrors?.[key]?.[0] : undefined;
    return code ? t(`errors.${code === 'out_of_range' ? 'outOfRange' : code === 'too_short' ? 'tooShort' : 'invalid'}`) : undefined;
  };
  const field = (key: 'titleEn' | 'titleEs', label: string) => <div className="space-y-1.5">
    <label htmlFor={`${id}-${key}`} className="text-sm font-medium">{label}</label>
    <Input id={`${id}-${key}`} value={form[key]} onChange={set(key)} maxLength={ANNOUNCEMENT_TITLE_MAX} aria-invalid={Boolean(errorOf(key))} />
    {errorOf(key) && <p className="text-sm text-destructive">{errorOf(key)}</p>}
  </div>;
  const area = (key: 'bodyEn' | 'bodyEs' | 'reason', label: string, max: number) => <div className="space-y-1.5">
    <label htmlFor={`${id}-${key}`} className="text-sm font-medium">{label}</label>
    <Textarea id={`${id}-${key}`} value={form[key]} onChange={set(key)} maxLength={max} rows={3} aria-invalid={Boolean(errorOf(key))} />
    {errorOf(key) && <p className="text-sm text-destructive">{errorOf(key)}</p>}
  </div>;

  return <section aria-labelledby="config-announcements" className="space-y-3">
    <div className="space-y-1"><h2 id="config-announcements" className={adminH2}>{t('title')}</h2><p className="text-sm text-muted-foreground">{t('intro')}</p></div>
    {rows.length > 0 && <ul className="space-y-2">{rows.map((row) => <li key={row.id} className={`${adminSection} space-y-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={stateTones[row.state]} label={t(`state.${row.state}`)} />
        <span className="text-sm font-medium">{row.market.name}</span>
        <span className="text-sm text-muted-foreground">{t('until', { date: formatDate(row.endsAt) })} · {t('by', { name: row.createdBy })} · {t('dismissals', { count: row.dismissals })}</span>
      </div>
      <p className="font-semibold">{row.titleEn}</p>
      <p className="text-sm text-muted-foreground">{row.bodyEn}</p>
      <p className="text-sm text-muted-foreground" lang="es">{row.titleEs} · {row.bodyEs}</p>
      {row.state !== 'ended' && onEnd && <AdminReasonAction
        trigger={t('end')}
        title={t('endTitle', { market: row.market.name })}
        description={t('endDescription')}
        submit={t('end')}
        pending={t('ending')}
        destructive
        action={onEnd}
        payload={{ id: row.id }}
        field="reason"
        notAllowed={t('notAllowed')}
      />}
    </li>)}</ul>}
    {onPublish && <form noValidate className={`${adminSection} space-y-4`} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      startTransition(async () => {
        let next: ActionResult;
        try {
          next = await onPublish(form);
        } catch {
          next = { ok: false, code: 'unknown' };
        }
        setResult(next);
        if (next.ok) {
          toast.success(t('published'));
          setForm({ ...form, titleEn: '', bodyEn: '', titleEs: '', bodyEs: '', endsDate: '', reason: '' });
        }
      });
    }}>
      <h3 className="font-semibold">{t('new')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-market`} className="text-sm font-medium">{t('market')}</label>
          <select id={`${id}-market`} value={form.marketId} onChange={set('marketId')} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm">
            {markets.map((market) => <option key={market.id} value={market.id}>{market.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-ends`} className="text-sm font-medium">{t('endsDate')}</label>
          <Input id={`${id}-ends`} type="date" value={form.endsDate} onChange={set('endsDate')} aria-invalid={Boolean(errorOf('endsDate'))} aria-describedby={`${id}-ends-hint`} />
          <p id={`${id}-ends-hint`} className="text-xs text-muted-foreground">{t('endsHint')}</p>
          {errorOf('endsDate') && <p className="text-sm text-destructive">{errorOf('endsDate')}</p>}
        </div>
        {field('titleEn', t('titleEn'))}
        {field('titleEs', t('titleEs'))}
        {area('bodyEn', t('bodyEn'), ANNOUNCEMENT_BODY_MAX)}
        {area('bodyEs', t('bodyEs'), ANNOUNCEMENT_BODY_MAX)}
      </div>
      {area('reason', t('reason'), 1000)}
      {result && !result.ok && !result.fieldErrors && <FormFeedback result={result} />}
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'publishing' : 'publish')}</Button>
    </form>}
  </section>;
}
