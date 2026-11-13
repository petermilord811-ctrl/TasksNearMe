/**
 * Who may see an uploaded file (blueprint 08 §4), from the file alone: work samples are public profile
 * content; everything else is for its owner and staff. Access through what a file belongs to (task photos
 * for bookable helpers and the booked helper, a profile photo while it's someone's current one) is in
 * `related-access.ts`.
 */
export interface FileAccessViewer {
  userId: string | null;
  isStaff: boolean;
}

export function canViewFile(file: { kind: string; ownerUserId: string }, viewer: FileAccessViewer): boolean {
  // Proof-of-address documents open only through the staff link (a logged reason, 5 minutes), never here,
  // not even for their owner: a stolen session shouldn't hand over someone's bill.
  if (file.kind === 'address_proof') return false;
  if (file.kind === 'work_sample') return true;
  if (viewer.isStaff) return true;
  return viewer.userId !== null && viewer.userId === file.ownerUserId;
}
