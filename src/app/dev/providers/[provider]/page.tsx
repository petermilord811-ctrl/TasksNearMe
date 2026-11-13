import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { devBackgroundOutcome, devIdentityOutcome, devPayoutOutcome } from '@/modules/verification/dev-actions';

export const metadata = { title: 'Dev provider' };

/**
 * Development only (the /dev layout 404s in production): stand-ins for Stripe Identity, Stripe
 * Connect onboarding, and Checkr. Each button simulates the provider's result and webhook.
 */
const PROVIDERS = {
  identity: {
    title: 'ID check (Stripe Identity stand-in)',
    field: 'session',
    action: devIdentityOutcome,
    outcomes: [
      ['verified', 'Pass: verified'],
      ['verified_name_differs', 'Pass, but the ID shows a different name (staff name check)'],
      ['document_unreadable', 'Fail: document unreadable'],
      ['selfie_mismatch', 'Fail: selfie mismatch'],
      ['under_18', 'Fail: under 18'],
      ['canceled', 'Canceled (closed the window)'],
      ['processing', 'Leave processing'],
    ],
  },
  payout: {
    title: 'Payout setup (Stripe Connect stand-in)',
    field: null,
    action: devPayoutOutcome,
    outcomes: [
      ['active', 'Complete: payouts active'],
      ['requirements_due', 'More information needed'],
      ['restricted', 'Restricted'],
    ],
  },
  background: {
    title: 'Background check (Checkr stand-in)',
    field: 'check',
    action: devBackgroundOutcome,
    outcomes: [
      ['clear', 'Result: clear'],
      ['consider', 'Result: consider (review)'],
      ['suspended', 'Suspended (Checkr needs more information)'],
      ['canceled', 'Canceled'],
      ['pending', 'Still pending'],
    ],
  },
} as const;

export default function DevProviderPage({ params, searchParams }: PageProps<'/dev/providers/[provider]'>) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 640 }}>
      <Suspense fallback={<p>Loading…</p>}>
        <Provider params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Provider({ params, searchParams }: Pick<PageProps<'/dev/providers/[provider]'>, 'params' | 'searchParams'>) {
  const [{ provider }, search] = await Promise.all([params, searchParams]);
  const config = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!config) notFound();
  const ref = config.field ? String(search[config.field] ?? '') : '';
  // Where the real provider would send the person back (a client's ID check comes back to its own page).
  const next = typeof search.next === 'string' ? search.next : '';
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>{config.title}</h1>
      <p style={{ color: '#555' }}>Development stand-in. Choose what the provider reports.</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        {config.outcomes.map(([value, label]) => (
          <form key={value} action={config.action}>
            {config.field ? <input type="hidden" name={config.field} value={ref} /> : null}
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <input type="hidden" name="outcome" value={value} />
            <button type="submit" style={{ padding: '10px 14px', border: '1px solid #ccc', borderRadius: 8, width: '100%', textAlign: 'left' }}>
              {label}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
