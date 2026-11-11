import { useTranslations } from 'next-intl';
import type { PaymentMethodLabel as MethodLabel } from '@/contracts';

export function PaymentMethodLabel({ method }: { method: MethodLabel }) {
  const t = useTranslations('payments');
  const brand = t(`brands.${method.brand}`);
  return <span className="tabular-nums">{method.last4 && method.brand !== 'apple_pay' && method.brand !== 'google_pay'
    ? t('cardLabel', { brand, last4: method.last4 })
    : brand}</span>;
}
