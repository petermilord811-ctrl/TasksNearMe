'use client';

/**
 * Stripe.js, loaded from js.stripe.com only when a checkout needs it (Stripe doesn't allow hosting it
 * elsewhere), one instance per publishable key. Card details stay inside Stripe's iframe; the app only
 * sees the PaymentMethod id. Only the few calls the app uses are typed here.
 */

export interface StripeCardElement {
  mount(target: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  focus(): void;
  on(event: 'change', handler: (event: { complete: boolean; empty: boolean; error?: { message?: string } }) => void): void;
  on(event: 'ready' | 'focus' | 'blur', handler: () => void): void;
  update(options: Record<string, unknown>): void;
}

export interface StripeJs {
  elements(options?: Record<string, unknown>): { create(type: 'card', options?: Record<string, unknown>): StripeCardElement };
  createPaymentMethod(options: { type: 'card'; card: StripeCardElement }): Promise<{ paymentMethod?: { id: string }; error?: { message?: string } }>;
  handleNextAction(options: { clientSecret: string }): Promise<{ paymentIntent?: { status: string }; error?: { message?: string } }>;
}

type StripeFactory = (publishableKey: string) => StripeJs;

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

let loading: Promise<StripeFactory> | null = null;
const instances = new Map<string, StripeJs>();

function loadFactory(): Promise<StripeFactory> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Stripe.js runs in the browser'));
  if (window.Stripe) return Promise.resolve(window.Stripe);
  loading ??= new Promise<StripeFactory>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js did not load')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Stripe.js did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function loadStripe(publishableKey: string): Promise<StripeJs> {
  const existing = instances.get(publishableKey);
  if (existing) return existing;
  const stripe = (await loadFactory())(publishableKey);
  instances.set(publishableKey, stripe);
  return stripe;
}
