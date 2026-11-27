import { after } from 'next/server';
import { db } from '@/platform/db/client';
import { readDocumentsJob } from './read-documents';

/**
 * A document someone just sent is read within seconds, not at the job runner's next minute (owner, 2026-11-27: the
 * flow's "Verifying…" screen shows each check as it finishes). The read is the job's own (`readDocumentsJob`, scoped to
 * this person), run after the response is sent, in this server process: the readers take one document at a time, and
 * one the job is already reading is skipped (`auto-check.ts`). A failure is logged; the job tries again within a minute.
 */
export function readDocumentsSoon(userId: string): void {
  after(async () => {
    try {
      await readDocumentsJob(db, new Date(), { userIds: [userId] });
    } catch (error) {
      console.error('[document-reader] reading at once failed:', error instanceof Error ? error.name : 'error');
    }
  });
}
