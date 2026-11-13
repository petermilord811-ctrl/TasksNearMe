'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/ui/primitives/spinner';
import { loadStripe, type StripeCardElement } from './stripe-js';

/**
 * A new card in Stripe's own field (an iframe: the number never touches the app). Once the card is
 * complete it becomes a PaymentMethod and `onChange` gets its id ('' while incomplete or after an edit), so
 * every checkout form keeps sending one payment choice.
 */
export function StripeCardField({ publishableKey, onChange, disabled = false, describedBy }: {
  publishableKey: string;
  onChange: (paymentMethodId: string) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations('payments.picker');
  const id = useId();
  const mountPoint = useRef<HTMLDivElement>(null);
  const card = useRef<StripeCardElement | null>(null);
  const report = useEffectEvent((paymentMethodId: string) => onChange(paymentMethodId));
  const failedMessage = useEffectEvent(() => t('cardFailed'));
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [message, setMessage] = useState<string>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    let attempt = 0;
    void loadStripe(publishableKey).then((stripe) => {
      if (!active || !mountPoint.current) return;
      const styles = getComputedStyle(mountPoint.current);
      const element = stripe.elements().create('card', {
        hidePostalCode: false,
        style: {
          base: { color: styles.color, fontFamily: styles.fontFamily, fontSize: '16px', '::placeholder': { color: styles.getPropertyValue('--muted-foreground') || '#78716c' } },
          invalid: { color: styles.getPropertyValue('--destructive') || '#b42318' },
        },
      });
      element.on('change', (event) => {
        // Each completed card becomes one PaymentMethod; an answer for an older version of the card is dropped.
        const mine = ++attempt;
        setMessage(event.error?.message);
        report('');
        if (!event.complete) {
          setChecking(false);
          return;
        }
        setChecking(true);
        void stripe.createPaymentMethod({ type: 'card', card: element }).then((result) => {
          if (!active || mine !== attempt) return;
          setChecking(false);
          if (result.paymentMethod) report(result.paymentMethod.id);
          else setMessage(result.error?.message ?? failedMessage());
        });
      });
      element.mount(mountPoint.current);
      card.current = element;
      setState('ready');
    }, () => { if (active) setState('failed'); });
    return () => {
      active = false;
      card.current?.destroy();
      card.current = null;
    };
  }, [publishableKey]);

  useEffect(() => { card.current?.update({ disabled }); }, [disabled]);

  return <div className="space-y-2">
    <p id={`${id}-label`} className="font-medium">{t('cardLabel')}</p>
    <div
      ref={mountPoint}
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={[describedBy, message ? `${id}-message` : ''].filter(Boolean).join(' ') || undefined}
      aria-busy={state === 'loading' || checking}
      className="min-h-12 rounded-xl border border-input bg-card px-3.5 py-3.5 text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring"
    />
    {state === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{t('cardLoading')}</p>}
    {state === 'failed' && <p role="alert" className="text-sm text-destructive">{t('cardUnavailable')}</p>}
    <p id={`${id}-message`} aria-live="polite" className="min-h-5 text-sm text-destructive">{message}</p>
  </div>;
}
