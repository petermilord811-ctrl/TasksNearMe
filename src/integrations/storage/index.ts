import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * File storage port. Development keeps files on local disk (`.data/uploads`, gitignored);
 * production uses object storage (Cloudflare R2) with presigned direct uploads once keys exist.
 */
export interface FileStorage {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export function createLocalFileStorage(root = path.join(process.cwd(), '.data', 'uploads')): FileStorage {
  const resolve = (key: string) => {
    if (!/^[a-z0-9_./-]+$/i.test(key) || key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    return path.join(root, key);
  };
  return {
    name: 'local',
    async put(key, body) {
      const target = resolve(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body);
    },
    async get(key) {
      try {
        return await fs.readFile(resolve(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

export function createFileStorage(): FileStorage {
  if (process.env.R2_BUCKET) {
    // TODO(integration): R2 adapter with presigned uploads (Phase 10). Refuse to silently use disk.
    throw new Error('R2_BUCKET is set but the R2 storage adapter is not implemented yet.');
  }
  return createLocalFileStorage();
}
