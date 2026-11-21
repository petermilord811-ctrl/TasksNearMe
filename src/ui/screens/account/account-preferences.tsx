'use client';

import { useId, useState } from 'react';
import { LockKeyhole, MoonStar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS, type AccountHandlers, type AccountPageData, type ActionResult } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Spinner } from '@/ui/primitives/spinner';
import { cn } from '@/ui/lib/utils';
import { Switch } from '@/ui/primitives/switch';
import { useAccountAction } from './use-account-action';

type Preference = AccountPageData['preferences'][number];

function PreferenceSwitch({ preference, onSave, hintId, onResult }: {
  preference: Preference;
  onSave: AccountHandlers['onSavePreference'];
  hintId: string;
  onResult: (result: ActionResult | undefined, label: string) => void;
}) {
  const t = useTranslations('account');
  const id = useId();
  const [enabled, setEnabled] = useState(preference.enabled);
  // A refresh brings the saved value: follow it here rather than remounting, which would drop focus (J-C8).
  const [saved, setSaved] = useState(preference.enabled);
  if (saved !== preference.enabled) { setSaved(preference.enabled); setEnabled(preference.enabled); }
  const action = useAccountAction();
  const label = t('preferences.switchLabel', { topic: t(`preferences.topics.${preference.topic}`), channel: t(`preferences.channels.${preference.channel}`) });

  return <div className="relative flex items-center justify-center">
    <label htmlFor={id} className="relative flex min-h-11 min-w-11 items-center justify-center px-2">
      {/* Always on (bookings, payments, the account's email): fully on, not faded, with a lock on it (audit L8). */}
      <Switch id={id} aria-label={label} aria-describedby={preference.locked ? hintId : undefined} aria-busy={action.pending} checked={preference.locked || enabled} disabled={preference.locked} className={cn(preference.locked && 'disabled:cursor-default disabled:opacity-100')} onCheckedChange={async (nextEnabled) => {
        // Saving: the switch keeps focus (a disabled one would drop it) and waits for the answer (J-C8).
        if (action.pending) return;
        const previous = enabled;
        setEnabled(nextEnabled);
        onResult(undefined, label);
        const result = await action.run(onSave, { topic: preference.topic, channel: preference.channel, enabled: nextEnabled });
        if (!result?.ok) setEnabled(previous);
        onResult(result, label);
      }} />
      {preference.locked && <LockKeyhole aria-hidden="true" className="pointer-events-none absolute -top-0.5 right-0.5 size-3.5 rounded-full bg-card p-px text-muted-foreground" />}
    </label>
    {action.pending && <Spinner aria-hidden="true" className="absolute right-0 size-3" />}
  </div>;
}

export function AccountPreferences({ preferences, onSave }: {
  preferences: AccountPageData['preferences'];
  onSave: AccountHandlers['onSavePreference'];
}) {
  const t = useTranslations('account');
  const hintId = useId();
  const [feedback, setFeedback] = useState<{ result?: ActionResult; label: string }>();
  // The channels this site has (no text column where texts don't go out, plan 9.2).
  const channels = NOTIFICATION_CHANNELS.filter((channel) => preferences.some((item) => item.channel === channel));

  return <div className="space-y-4">
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">{t('preferences.caption')}</caption>
      <thead><tr className="border-b">
        <th scope="col" className="w-2/5 py-3 text-left font-medium text-muted-foreground">{t('preferences.topic')}</th>
        {/* Short column names (audit M37: "Text message (SMS)" wrapped to three lines on phones); each switch keeps the full name. */}
        {channels.map((channel) => <th key={channel} scope="col" className="px-1 py-3 text-center font-medium text-muted-foreground">{t(`preferences.columns.${channel}`)}</th>)}
      </tr></thead>
      <tbody>{NOTIFICATION_TOPICS.map((topic) => <tr key={topic} className="border-b last:border-b-0">
        <th scope="row" className="py-3 pr-2 text-left font-medium">{t(`preferences.topics.${topic}`)}</th>
        {channels.map((channel) => {
          const preference = preferences.find((item) => item.topic === topic && item.channel === channel);
          return <td key={channel} className="px-1 py-1">{preference ? <PreferenceSwitch key={String(preference.locked)} preference={preference} onSave={onSave} hintId={hintId} onResult={(result, label) => setFeedback({ result, label })} /> : <span className="block text-center text-muted-foreground">{t('preferences.unavailable')}</span>}</td>;
        })}
      </tr>)}</tbody>
    </table>
    <p id={hintId} className="flex items-start gap-2 text-sm text-muted-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('preferences.locked')}</span></p>
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><MoonStar aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{t('preferences.quietHours')}</span></p>
    <FormFeedback result={feedback?.result} successMessage={feedback ? t('preferences.saved', { preference: feedback.label }) : undefined} errorMessage={feedback?.result && !feedback.result.ok && feedback.result.code === 'not_allowed' ? t('preferences.notAllowed') : undefined} />
  </div>;
}
