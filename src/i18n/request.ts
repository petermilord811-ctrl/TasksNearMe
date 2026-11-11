import { getRequestConfig } from 'next-intl/server';
import { MARKET_TIME_ZONE } from '@/contracts/common';
import appMessages from '../../messages/en/app';
import uiMessages from '../../messages/en/ui';

/**
 * Single locale for now ("en"), no locale prefix in URLs.
 * UI copy (owned by Codex) lives in messages/en/ui/*; server-side copy (owned by Claude) in
 * messages/en/app/* under the top-level "server" namespace, so the two never collide.
 */
export default getRequestConfig(async () => ({
  locale: 'en',
  timeZone: MARKET_TIME_ZONE,
  messages: { ...uiMessages, ...appMessages },
}));
