/**
 * What a person typed and hasn't sent yet, kept in this tab's sessionStorage under their account: the posting wizard's
 * draft (with the exact address, unit and access notes) and helper setup's unsaved text. On a shared computer the next
 * person could read it, so it goes when the person signs out and when a sign-in or sign-up page opens (sweep
 * 2026-11-20). The landing assistant's words (`tnm:assistant:`) belong to no account and stay.
 */
const PERSONAL_DRAFT_PREFIXES = ['tasksnearme:post-task:', 'tnm:helper-setup:'];

export function forgetPersonalDrafts(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined = typeof window === 'undefined' ? undefined : window.sessionStorage): void {
  if (!storage) return;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null && PERSONAL_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix)));
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage blocked (a private window, site data off): nothing was kept there either.
  }
}
