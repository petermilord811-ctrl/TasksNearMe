import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signV4 } from '../../src/integrations/storage/r2';
import { BucketError, bucketStore, localStore } from '../../scripts/backup/lib/store';

const SECRET = 'backup-test-secret';

/**
 * A stand-in S3 bucket that checks every request's SigV4 signature the way S3 does (recomputed from what arrived)
 * and each upload's payload hash, and pages listings two keys at a time with a continuation token that needs encoding.
 */
function fakeBucket() {
  const objects = new Map<string, Buffer>();
  const locked = new Set<string>();
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      const authorization = String(request.headers.authorization ?? '');
      const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/\d{8}\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=[0-9a-f]{64}$/.exec(authorization);
      const payloadHash = String(request.headers['x-amz-content-sha256'] ?? '');
      const amzDate = String(request.headers['x-amz-date'] ?? '');
      const signedExtra = (match?.[3] ?? '').split(';').filter((name) => !['host', 'x-amz-date', 'x-amz-content-sha256'].includes(name));
      const expected = match
        ? signV4({
            method: request.method ?? 'GET',
            url,
            headers: Object.fromEntries(signedExtra.map((name) => [name, String(request.headers[name] ?? '')])),
            payloadHash,
            accessKeyId: match[1] ?? '',
            secretAccessKey: SECRET,
            region: match[2] ?? '',
            service: 's3',
            now: new Date(amzDate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')),
          }).authorization
        : '';
      const reply = (status: number, text = '') => {
        response.writeHead(status, { 'content-type': 'application/xml' });
        response.end(text);
      };
      if (!match || expected !== authorization) return reply(403, '<Error><Code>SignatureDoesNotMatch</Code></Error>');
      if (request.method === 'PUT' && createHash('sha256').update(body).digest('hex') !== payloadHash) {
        return reply(400, '<Error><Code>XAmzContentSHA256Mismatch</Code></Error>');
      }
      const [, bucket, ...rest] = url.pathname.split('/');
      if (bucket !== 'backups') return reply(404, '<Error><Code>NoSuchBucket</Code></Error>');
      const key = rest.map(decodeURIComponent).join('/');
      if (request.method === 'GET' && !key) {
        const prefix = url.searchParams.get('prefix') ?? '';
        const keys = [...objects.keys()].filter((name) => name.startsWith(prefix)).sort();
        const start = Number((url.searchParams.get('continuation-token') ?? 'page+0/=').replace(/^page\+|\/=$/g, ''));
        const page = keys.slice(start, start + 2);
        const more = start + 2 < keys.length;
        const contents = page.map((name) => `<Contents><Key>${name}</Key><Size>${objects.get(name)?.length ?? 0}</Size></Contents>`).join('');
        return reply(200, `<ListBucketResult>${contents}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>page+${start + 2}/=</NextContinuationToken>` : ''}</ListBucketResult>`);
      }
      if (request.method === 'PUT') {
        objects.set(key, body);
        return reply(200);
      }
      if (request.method === 'GET') {
        const found = objects.get(key);
        if (!found) return reply(404, '<Error><Code>NoSuchKey</Code></Error>');
        response.writeHead(200);
        return response.end(found);
      }
      if (request.method === 'DELETE') {
        if (locked.has(key)) return reply(403, '<Error><Code>AccessDenied</Code></Error>');
        objects.delete(key);
        return reply(204);
      }
      return reply(405);
    });
  });
  return { server, objects, locked };
}

let dir = '';
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-store-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the bucket store', () => {
  const bucket = fakeBucket();
  let endpoint = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => bucket.server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(bucket.server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => bucket.server.close(() => resolve())));
  beforeEach(() => {
    bucket.objects.clear();
    bucket.locked.clear();
  });
  const store = (secret = SECRET) => bucketStore({ endpoint, bucket: 'backups', prefix: 'tasksnearme-preview', accessKeyId: 'AKIDTEST', secretAccessKey: secret });

  it('uploads with a signed payload hash and downloads the same bytes', async () => {
    const original = path.join(dir, 'original');
    await fs.writeFile(original, randomBytes(300_000));
    await store().put('daily/2026-11-21T08-30-00Z/db.dump.gpg', original);
    expect([...bucket.objects.keys()]).toEqual(['tasksnearme-preview/daily/2026-11-21T08-30-00Z/db.dump.gpg']);
    const copy = path.join(dir, 'copy');
    expect(await store().get('daily/2026-11-21T08-30-00Z/db.dump.gpg', copy)).toBe(true);
    expect(Buffer.compare(await fs.readFile(copy), await fs.readFile(original))).toBe(0);
    expect(await store().get('daily/2026-11-21T08-30-00Z/missing.gpg', path.join(dir, 'missing'))).toBe(false);
  });

  it('lists across pages, relative to its prefix, and by folder', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) bucket.objects.set(`tasksnearme-preview/daily/2026-11-21T08-30-00Z/${name}`, Buffer.from(name.repeat(3)));
    bucket.objects.set('tasksnearme-preview/weekly/2026-11-21T08-30-00Z/SHA256SUMS', Buffer.from('x'));
    bucket.objects.set('tasksnearme-previewer/daily/2026-11-21T08-30-00Z/other', Buffer.from('x'));
    const all = await store().list('');
    expect(all).toHaveLength(6);
    expect(all[0]).toEqual({ key: 'daily/2026-11-21T08-30-00Z/a', bytes: 3 });
    expect((await store().list('weekly/2026-11-21T08-30-00Z/')).map((object) => object.key)).toEqual(['weekly/2026-11-21T08-30-00Z/SHA256SUMS']);
    await expect(store().list('weekly')).rejects.toThrow(/Invalid backup folder/);
  });

  it('deletes, treats a missing object as deleted, and reports a bucket lock as 403', async () => {
    bucket.objects.set('tasksnearme-preview/daily/2026-11-14T08-30-00Z/SHA256SUMS', Buffer.from('x'));
    await store().delete('daily/2026-11-14T08-30-00Z/SHA256SUMS');
    await store().delete('daily/2026-11-14T08-30-00Z/SHA256SUMS');
    expect(bucket.objects.size).toBe(0);
    bucket.objects.set('tasksnearme-preview/daily/2026-11-20T08-30-00Z/SHA256SUMS', Buffer.from('x'));
    bucket.locked.add('tasksnearme-preview/daily/2026-11-20T08-30-00Z/SHA256SUMS');
    const refused = await store().delete('daily/2026-11-20T08-30-00Z/SHA256SUMS').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(BucketError);
    expect((refused as BucketError).status).toBe(403);
  });

  it('fails clearly with the wrong secret, and refuses bad keys before asking', async () => {
    const file = path.join(dir, 'file');
    await fs.writeFile(file, 'x');
    await expect(store('wrong').put('daily/2026-11-21T08-30-00Z/db.dump.gpg', file)).rejects.toThrow(/answered 403 \(SignatureDoesNotMatch\)/);
    for (const bad of ['../escape', '/absolute', 'daily//x', 'daily/x/']) await expect(store().put(bad, file)).rejects.toThrow(/Invalid backup key/);
  });
});

describe('the folder store', () => {
  it('writes privately, lists, reads and deletes, removing emptied folders', async () => {
    const root = path.join(dir, 'store');
    const file = path.join(dir, 'file');
    await fs.writeFile(file, 'backup bytes');
    const store = localStore(root);
    await store.put('daily/2026-11-21T08-30-00Z/db.dump.gpg', file);
    await fs.writeFile(path.join(root, 'daily/2026-11-21T08-30-00Z/half.gpg.partial'), 'x');
    expect((await fs.stat(path.join(root, 'daily/2026-11-21T08-30-00Z/db.dump.gpg'))).mode & 0o777).toBe(0o600);
    expect(await store.list('')).toEqual([{ key: 'daily/2026-11-21T08-30-00Z/db.dump.gpg', bytes: 12 }]);
    expect(await store.list('weekly/2026-11-21T08-30-00Z/')).toEqual([]);
    const copy = path.join(dir, 'copy');
    expect(await store.get('daily/2026-11-21T08-30-00Z/db.dump.gpg', copy)).toBe(true);
    expect(await fs.readFile(copy, 'utf8')).toBe('backup bytes');
    await fs.rm(path.join(root, 'daily/2026-11-21T08-30-00Z/half.gpg.partial'));
    await store.delete('daily/2026-11-21T08-30-00Z/db.dump.gpg');
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('refuses keys that leave its folder', async () => {
    const store = localStore(path.join(dir, 'store'));
    for (const bad of ['../outside', '/etc/passwd', 'a/../../b']) await expect(store.get(bad, path.join(dir, 'x'))).rejects.toThrow(/Invalid backup key/);
  });
});
