import { IntlErrorCode, type IntlError } from 'next-intl';
import { E2E_BUILD } from '@/shared/dev-helpers';

/** What's wrong with the copy itself: a key the catalog doesn't have (or that names a group), a broken message, or arguments that don't fit. */
const COPY_ERRORS: readonly string[] = [IntlErrorCode.MISSING_MESSAGE, IntlErrorCode.INSUFFICIENT_PATH, IntlErrorCode.INVALID_KEY, IntlErrorCode.INVALID_MESSAGE, IntlErrorCode.FORMATTING_ERROR];

/**
 * next-intl's error handler (completion plan 5.19). A wrong key only logs and shows the raw key by default, so it
 * passed every check (adminCases.response). In the e2e build a copy error throws, on the server and in the
 * browser, so the page fails and so does the test; anything else (an environment fallback) still logs. Dev and
 * production keep the default: log and fall back.
 */
export const intlOnError: ((error: IntlError) => void) | undefined = E2E_BUILD
  ? (error) => {
      if (COPY_ERRORS.includes(error.code)) throw error;
      console.error(error);
    }
  : undefined;
