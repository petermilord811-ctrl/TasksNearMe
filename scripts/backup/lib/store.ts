/**
 * Where backups go: a local folder, or an S3-compatible bucket (Cloudflare R2) under a prefix. Keys are
 * `<kind>/<stamp>/<file>`. The bucket client signs requests with the app's own SigV4 (src/integrations/storage/r2.ts,
 * tested against AWS's published example) and streams files, so a backup never has to fit in memory. A single
 * upload is limited to about 5 GiB on R2, far above what these backups hold today (docs/runbooks/backup-and-restore.md).
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { signV4 } from '../../../src/integrations/storage/r2';
import { sha256File } from './tools';

export interface StoredObject {
  key: string;
  bytes: number;
}

export interface BackupStore {
  /** For logs; never holds a secret. */
  readonly label: string;
  put(key: string, file: string): Promise<void>;
  /** Writes the object to `file`; false when there's no such object. */
  get(key: string, file: string): Promise<boolean>;
  /** The objects under `prefix` (`''` for all), with keys relative to the store. */
  list(prefix: string): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
}

function checkKey(key: string): string {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/.test(key) || key.includes('..') || key.includes('//') || key.endsWith('/')) {
    throw new Error(`Invalid backup key: ${key}`);
  }
  return key;
}

/** A listing prefix is the whole store (`''`) or a folder (`daily/<stamp>/`). */
function checkFolder(prefix: string): string {
  if (prefix && (!prefix.endsWith('/') || !checkKey(prefix.slice(0, -1)))) throw new Error(`Invalid backup folder: ${prefix}`);
  return prefix;
}

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Files under `root`, private to the account running the backup. Writes go through a `.partial` file and a rename. */
export function localStore(root: string): BackupStore {
  const base = path.resolve(root);
  const full = (key: string) => path.join(base, checkKey(key));
  return {
    label: `folder ${base}`,
    async put(key, file) {
      const target = full(key);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temp = `${target}.partial`;
      await fs.copyFile(file, temp);
      await fs.chmod(temp, 0o600);
      await fs.rename(temp, target);
    },
    async get(key, file) {
      try {
        await fs.copyFile(full(key), file);
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    async list(prefix) {
      const objects: StoredObject[] = [];
      const walk = async (dir: string): Promise<void> => {
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (error) {
          if (isMissing(error)) return;
          throw error;
        }
        for (const entry of entries) {
          const at = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(at);
          else if (entry.isFile() && !entry.name.endsWith('.partial')) {
            objects.push({ key: path.relative(base, at).split(path.sep).join('/'), bytes: (await fs.stat(at)).size });
          }
        }
      };
      await walk(checkFolder(prefix) ? full(prefix.slice(0, -1)) : base);
      return objects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
    async delete(key) {
      const target = full(key);
      await fs.rm(target, { force: true });
      // Folders the delete left empty go too, up to the root.
      for (let dir = path.dirname(target); dir.startsWith(`${base}${path.sep}`); dir = path.dirname(dir)) {
        try {
          await fs.rmdir(dir);
        } catch {
          break;
        }
      }
    },
  };
}

export interface BucketConfig {
  /** `https://<account id>.r2.cloudflarestorage.com`, or another S3-compatible endpoint. */
  endpoint: string;
  bucket: string;
  /** Folder in the bucket, e.g. `tasksnearme-preview`; empty for the bucket's root. */
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  now?: () => Date;
}

export class BucketError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

function send(method: string, url: URL, headers: Record<string, string>, body?: { file: string; bytes: number }): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, { method, headers: body ? { ...headers, 'content-length': String(body.bytes) } : headers }, resolve);
    request.setTimeout(120_000, () => request.destroy(new Error(`${method} ${url.pathname} got no answer for 2 minutes`)));
    request.on('error', reject);
    if (!body) {
      request.end();
      return;
    }
    const file = createReadStream(body.file);
    file.on('error', (error) => request.destroy(error));
    file.pipe(request);
  });
}

async function textOf(response: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** An S3-compatible bucket (R2). Keys go under `prefix/`. */
export function bucketStore(config: BucketConfig): BackupStore {
  const endpoint = config.endpoint.replace(/\/+$/, '');
  const prefix = config.prefix.replace(/^\/+|\/+$/g, '');
  if (prefix) checkKey(prefix);
  const bucketPath = `${endpoint}/${encodeURIComponent(config.bucket)}`;
  const objectUrl = (key: string) =>
    new URL(`${bucketPath}/${[prefix, checkKey(key)].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/')}`);
  const sign = (method: string, url: URL, payloadHash: string, headers: Record<string, string> = {}) =>
    signV4({
      method,
      url,
      headers,
      payloadHash,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region ?? 'auto',
      service: 's3',
      now: config.now?.() ?? new Date(),
    });
  const failure = (what: string, status: number, body: string) => {
    const code = /<Code>([^<]{1,80})<\/Code>/.exec(body)?.[1];
    return new BucketError(status, `${what}: the bucket answered ${status}${code ? ` (${code})` : ''}`);
  };

  return {
    label: `bucket ${config.bucket}${prefix ? `/${prefix}` : ''}`,
    async put(key, file) {
      const { sha256, bytes } = await sha256File(file);
      const url = objectUrl(key);
      const response = await send('PUT', url, sign('PUT', url, sha256, { 'content-type': 'application/octet-stream' }), { file, bytes });
      const body = await textOf(response);
      if (response.statusCode !== 200) throw failure(`Uploading ${key}`, response.statusCode ?? 0, body);
    },
    async get(key, file) {
      const url = objectUrl(key);
      const response = await send('GET', url, sign('GET', url, EMPTY_SHA256));
      if (response.statusCode === 404) {
        await textOf(response);
        return false;
      }
      if (response.statusCode !== 200) throw failure(`Downloading ${key}`, response.statusCode ?? 0, await textOf(response));
      const temp = `${file}.partial`;
      await pipeline(response, createWriteStream(temp, { mode: 0o600 }));
      await fs.rename(temp, file);
      return true;
    },
    async list(listPrefix) {
      checkFolder(listPrefix);
      const strip = prefix ? `${prefix}/` : '';
      const fullPrefix = `${strip}${listPrefix}`;
      const objects: StoredObject[] = [];
      let token: string | undefined;
      do {
        const url = new URL(bucketPath);
        url.searchParams.set('list-type', '2');
        if (fullPrefix) url.searchParams.set('prefix', fullPrefix);
        if (token) url.searchParams.set('continuation-token', token);
        const response = await send('GET', url, sign('GET', url, EMPTY_SHA256));
        const body = await textOf(response);
        if (response.statusCode !== 200) throw failure('Listing backups', response.statusCode ?? 0, body);
        for (const match of body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(match[1] ?? '')?.[1] ?? '');
          const bytes = Number(/<Size>(\d+)<\/Size>/.exec(match[1] ?? '')?.[1] ?? Number.NaN);
          if (key.startsWith(strip) && Number.isFinite(bytes)) objects.push({ key: key.slice(strip.length), bytes });
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(body)
          ? decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(body)?.[1] ?? '') || undefined
          : undefined;
      } while (token);
      return objects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
    async delete(key) {
      const url = objectUrl(key);
      const response = await send('DELETE', url, sign('DELETE', url, EMPTY_SHA256));
      const body = await textOf(response);
      // 404: already gone. A bucket lock answers 403 until the object's lock ends (the next run tries again).
      if (response.statusCode !== 204 && response.statusCode !== 200 && response.statusCode !== 404) {
        throw failure(`Deleting ${key}`, response.statusCode ?? 0, body);
      }
    },
  };
}
