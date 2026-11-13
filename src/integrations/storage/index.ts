import fs from 'node:fs/promises';
import path from 'node:path';
import { r2FromEnv } from './r2';

/**
 * File storage port. Development keeps files on local disk (`.data/uploads`, gitignored); with R2 keys the
 * files go to a private Cloudflare R2 bucket (`./r2.ts`). Reads always go through the app's routes.
 */
export interface FileStorage {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /** Deletes the object; deleting one that's already gone is fine. */
  delete(key: string): Promise<void>;
}

export function createLocalFileStorage(root = path.join(process.cwd(), '.data', 'uploads')): FileStorage {
  const resolve = (key: string) => {
    if (!/^[a-z0-9_./-]+$/i.test(key) || key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    // Files written at runtime: without the ignore, Next's file tracer copies the whole project into builds.
    return path.join(/*turbopackIgnore: true*/ root, key);
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
        return await fs.readFile(/*turbopackIgnore: true*/ resolve(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async delete(key) {
      try {
        await fs.unlink(resolve(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}

/**
 * The app's file storage: R2 when `R2_BUCKET` is set (`./r2.ts`), local disk otherwise. Production needs R2,
 * or `FILE_STORAGE=local` on a server with a lasting disk; without either it refuses to store files rather
 * than lose them with the next deploy.
 */
export function createFileStorage(env: Record<string, string | undefined> = process.env): FileStorage {
  const r2 = r2FromEnv(env);
  if (r2) return r2;
  if (env.NODE_ENV === 'production' && env.FILE_STORAGE !== 'local') {
    const refuse = async (): Promise<never> => {
      throw new Error('File storage needs R2 in production: set R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (or FILE_STORAGE=local on a lasting disk).');
    };
    return { name: 'unconfigured', put: refuse, get: refuse, delete: refuse };
  }
  return createLocalFileStorage();
}
