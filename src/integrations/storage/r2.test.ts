import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createFileStorage } from './index';
import { createR2FileStorage, r2FromEnv, signV4 } from './r2';

describe('AWS Signature Version 4', () => {
  it('signs the S3 GET example from the AWS documentation', () => {
    // "Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk", GET Object.
    const headers = signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      now: new Date('2013-05-24T00:00:00.000Z'),
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });
});

describe('R2 storage', () => {
  const now = () => new Date('2026-11-13T12:00:00.000Z');
  const config = { accountId: 'acc123', accessKeyId: 'AKID', secretAccessKey: 'SECRET', bucket: 'tnm-files', now };

  it('puts a private object with its type and hash, signed for the bucket', async () => {
    const fetcher = vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response(null, { status: 200 }));
    const storage = createR2FileStorage({ ...config, fetch: fetcher as unknown as typeof fetch });
    const body = Buffer.from('proof of address');
    await storage.put('address_proof/usr_1/adr_1.pdf', body, 'application/pdf');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://acc123.r2.cloudflarestorage.com/tnm-files/address_proof/usr_1/adr_1.pdf');
    expect(init?.method).toBe('PUT');
    const headers = init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/pdf');
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(body).digest('hex'));
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/20261113\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    // No public URL, ever: nothing like an ACL is sent.
    expect(Object.keys(headers).some((name) => name.startsWith('x-amz-acl'))).toBe(false);
  });

  it('reads an object back, says nothing for a missing one, and deletes quietly', async () => {
    const fetcher = vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 404 });
      return String(url).endsWith('/gone.jpg') ? new Response('<Error/>', { status: 404 }) : new Response(Buffer.from('jpeg bytes'), { status: 200 });
    });
    const storage = createR2FileStorage({ ...config, fetch: fetcher as unknown as typeof fetch });
    expect((await storage.get('task_photo/a.jpg'))?.toString()).toBe('jpeg bytes');
    expect(await storage.get('task_photo/gone.jpg')).toBeNull();
    await expect(storage.delete('task_photo/gone.jpg')).resolves.toBeUndefined();
    await expect(createR2FileStorage({ ...config, fetch: (async () => new Response(null, { status: 403 })) as unknown as typeof fetch }).get('x.jpg')).rejects.toThrow('R2 answered 403');
  });

  it('refuses keys that could leave the bucket path', async () => {
    const storage = createR2FileStorage({ ...config, fetch: vi.fn() as unknown as typeof fetch });
    await expect(storage.get('../secrets')).rejects.toThrow('Invalid storage key');
    await expect(storage.get('/abs/path')).rejects.toThrow('Invalid storage key');
  });

  it('is on with a bucket and its keys; production without it refuses to store files', async () => {
    expect(r2FromEnv({})).toBeNull();
    expect(() => r2FromEnv({ R2_BUCKET: 'b' })).toThrow(/R2_ACCOUNT_ID/);
    expect(r2FromEnv({ R2_BUCKET: 'b', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' })?.name).toBe('r2');
    await expect(createFileStorage({ NODE_ENV: 'production' }).put('a.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/needs R2 in production/);
    expect(createFileStorage({ NODE_ENV: 'production', FILE_STORAGE: 'local' }).name).toBe('local');
    expect(createFileStorage({ NODE_ENV: 'development' }).name).toBe('local');
  });
});
