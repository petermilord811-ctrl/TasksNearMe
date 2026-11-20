/**
 * Who may see an uploaded file (blueprint 08 §4), from the file alone: work samples are public profile
 * content; everything else is for its owner. Access through what a file belongs to (task photos for bookable
 * helpers and the booked helper, a profile photo while it's someone's current one) is in `related-access.ts`.
 * Staff open another person's file only with a token from the page that shows it (staff-file-token.ts): a case,
 * a revealed conversation, a task they moderate (security review SEC24).
 */
export interface FileAccessViewer {
  userId: string | null;
}

/** Verification documents: proofs of address, and our own ID check's photos and selfie (encrypted). */
const STAFF_LINK_ONLY = new Set(['address_proof', 'id_document', 'id_selfie']);

export function canViewFile(file: { kind: string; ownerUserId: string }, viewer: FileAccessViewer): boolean {
  // Verification documents open only through the staff link (a logged reason, 5 minutes), never here,
  // not even for their owner: a stolen session shouldn't hand over someone's bill or ID.
  if (STAFF_LINK_ONLY.has(file.kind)) return false;
  if (file.kind === 'work_sample') return true;
  return viewer.userId !== null && viewer.userId === file.ownerUserId;
}
