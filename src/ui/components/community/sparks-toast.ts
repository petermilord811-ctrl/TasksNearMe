'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/**
 * The success message after a post or a reply, with the Sparks it earned (plan 10.13): "Posted · +5 Sparks". Without
 * Sparks (the day's cap reached), just what happened. The route dialog shows it itself when it closes.
 */
export function useSparksMessage() {
  const t = useTranslations('community.sparks');
  return (message: string, sparks?: number) => sparks && sparks > 0 ? t('withSparks', { message, count: sparks }) : message;
}

/** The same message as a toast. */
export function useSparksToast() {
  const message = useSparksMessage();
  return (text: string, sparks?: number) => toast.success(message(text, sparks));
}
