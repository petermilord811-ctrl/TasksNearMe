/**
 * Who may see an uploaded file (blueprint 08 §4). Work samples are public profile content. Task
 * photos are for the poster and staff now; bookable helpers and booking participants get access
 * when offers and bookings exist. Evidence and receipts: owner and staff (participants later).
 */
export interface FileAccessViewer {
  userId: string | null;
  isStaff: boolean;
}

export function canViewFile(file: { kind: string; ownerUserId: string }, viewer: FileAccessViewer): boolean {
  if (file.kind === 'work_sample') return true;
  if (viewer.isStaff) return true;
  return viewer.userId !== null && viewer.userId === file.ownerUserId;
}
