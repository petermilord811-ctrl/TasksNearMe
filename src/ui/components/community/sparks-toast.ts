'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/**
 * The success toast after a post or a reply, with the Sparks it earned (plan 10.13): "Posted · +5 Sparks". Without
 * Sparks (the day's cap reached), just what happened.
 */
export function useSparksToast() {
  const t = useTranslations('community.sparks');
  return (message: string, sparks?: number) => toast.success(sparks && sparks > 0 ? t('withSparks', { message, count: sparks }) : message);
}
