/**
 * What a person typed and hasn't sent yet, kept in this tab's sessionStorage under their account: the posting wizard's
 * draft (with the exact address, unit and access notes), helper setup's unsaved text, a new offer's words (J-H7) and a question's (tnm:question:). On a shared computer the next
 * person could read it, so it goes when the person signs out and when a sign-in or sign-up page opens (sweep
 * 2026-11-20). The landing assistant's words (`tnm:assistant:`) belong to no account and stay.
 */
const PERSONAL_DRAFT_PREFIXES = ['tasksnearme:post-task:', 'tnm:helper-setup:', 'tnm:offer:', 'tnm:question:'];

/**
 * A task drafted signed out (/post, J-V5), waiting for its person to get an account: `{ code, draft }`. It goes like
 * every other draft, except on the sign-in and sign-up pages of its own handoff, whose destination carries its code.
 */
export const HANDOFF_DRAFT_KEY = 'tasksnearme:post-task:handoff:v1';

/** The handoff code stored with a waiting draft, if the stored value is one. */
export function storedHandoffCode(raw: string | null): string | undefined {
  try {
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    const code = typeof value === 'object' && value !== null ? (value as { code?: unknown }).code : undefined;
    return typeof code === 'string' && code ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `keepHandoff`: the code in this sign-in or sign-up page's destination. The draft waiting under it stays, so the
 * person's own task survives the account step; with no code, or another one, it goes too.
 */
export function forgetPersonalDrafts(storage: Pick<Storage, 'length' | 'key' | 'removeItem' | 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.sessionStorage, keepHandoff?: string): void {
  if (!storage) return;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null && PERSONAL_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix)));
    for (const key of keys) {
      if (key === HANDOFF_DRAFT_KEY && keepHandoff && storedHandoffCode(storage.getItem(key)) === keepHandoff) continue;
      storage.removeItem(key);
    }
  } catch {
    // Storage blocked (a private window, site data off): nothing was kept there either.
  }
}
