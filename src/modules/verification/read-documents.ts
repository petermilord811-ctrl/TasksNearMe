import { documentReaderFromEnv } from '@/integrations/ai/document-reader';
import { idReaderFromEnv } from '@/integrations/ai/id-document-reader';
import { createEmailProvider } from '@/integrations/email';
import { createFileStorage } from '@/integrations/storage';
import { byteCipherFromEnv, fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { readPendingDocuments } from './auto-check';
import { notifyDecidersOfIdReading } from './notify-deciders';

/**
 * The job that reads documents waiting for review (`verification.read_documents`, last in the runner): each proof of
 * address and each ID our own check holds is read once by the server's own readers. `scope.userIds`: only these
 * people's documents (a document someone just sent, read at once: `read-soon.ts`).
 */
export function readDocumentsJob(db: Db, now: Date, scope: { userIds?: readonly string[] } = {}) {
  const storage = createFileStorage();
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return readPendingDocuments(
    db,
    {
      storage,
      cipher: fieldCipherFromEnv(),
      reader: documentReaderFromEnv(),
      identity: {
        storage,
        files: byteCipherFromEnv(),
        reader: idReaderFromEnv(),
        addressCipher: fieldCipherFromEnv(),
        detailsCipher: fieldCipherFromEnv(),
        notify: (notice) => notifyDecidersOfIdReading(db, createEmailProvider(db), notice, appUrl),
      },
    },
    now,
    scope,
  );
}
