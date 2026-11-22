import 'server-only';

export { supportAssistantForRequest } from '@/modules/assist/assistant-choice';

export const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Signed out (or an account that can't use the app): the window shows nothing and stops asking. */
export const signedOut = () => Response.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
