import { createHash, createHmac } from 'node:crypto';
import type { FileStorage } from './index';

/**
 * Cloudflare R2 through its S3-compatible API (docs/integration-points.md), signed with AWS Signature
 * Version 4 using Node's crypto (no SDK). The bucket stays private: every read goes through the app's own
 * routes (`/api/files/<id>`, `/api/verification-documents/<token>`), which check who may see the file.
 */

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding, as SigV4 wants it (paths are encoded a segment at a time). */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface SigV4Request {
  method: string;
  url: URL;
  /** Headers to sign besides `host`, `x-amz-date` and `x-amz-content-sha256` (lowercase names). */
  headers?: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  now: Date;
}

/** The request's headers with its `Authorization` (AWS Signature Version 4, single chunk). */
export function signV4(request: SigV4Request): Record<string, string> {
  const amzDate = request.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: request.url.host,
    'x-amz-content-sha256': request.payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(request.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()])),
  };
  const names = Object.keys(headers).sort();
  const canonicalQuery = [...request.url.searchParams.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const canonicalPath = request.url.pathname.split('/').map((segment) => encodeRfc3986(decodeURIComponent(segment))).join('/');
  const canonical = [request.method, canonicalPath, canonicalQuery, ...names.map((name) => `${name}:${headers[name]}`), '', names.join(';'), request.payloadHash].join('\n');
  const scope = `${date}/${request.region}/${request.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${request.secretAccessKey}`, date), request.region), request.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${request.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Another S3-compatible endpoint (tests, or a jurisdiction-specific R2 endpoint). */
  endpoint?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export function createR2FileStorage(config: R2Config): FileStorage {
  const doFetch = config.fetch ?? fetch;
  const endpoint = (config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, '');
  const objectUrl = (key: string) => {
    if (!/^[a-z0-9_./-]+$/i.test(key) || key.includes('..') || key.startsWith('/')) throw new Error(`Invalid storage key: ${key}`);
    return new URL(`${endpoint}/${encodeURIComponent(config.bucket)}/${key.split('/').map((part) => encodeRfc3986(part)).join('/')}`);
  };
  async function call(method: 'GET' | 'PUT' | 'DELETE', key: string, body?: { data: Buffer; contentType: string }) {
    const url = objectUrl(key);
    const headers = signV4({
      method,
      url,
      ...(body ? { headers: { 'content-type': body.contentType } } : {}),
      payloadHash: body ? sha256Hex(body.data) : EMPTY_SHA256,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: 'auto',
      service: 's3',
      now: config.now?.() ?? new Date(),
    });
    delete headers.host;
    return doFetch(url, { method, headers, ...(body ? { body: new Uint8Array(body.data) } : {}), signal: AbortSignal.timeout(30_000) });
  }
  return {
    name: 'r2',
    async put(key, body, contentType) {
      const response = await call('PUT', key, { data: body, contentType });
      if (!response.ok) throw new Error(`R2 answered ${response.status} to a put`);
    },
    async get(key) {
      const response = await call('GET', key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 answered ${response.status} to a get`);
      return Buffer.from(await response.arrayBuffer());
    },
    async delete(key) {
      const response = await call('DELETE', key);
      // Deleting what's already gone is fine.
      if (!response.ok && response.status !== 404) throw new Error(`R2 answered ${response.status} to a delete`);
    },
  };
}

/** R2 when its bucket is set: the account id, an API token's S3 access key pair, and the bucket. */
export function r2FromEnv(env: Record<string, string | undefined> = process.env): FileStorage | null {
  const bucket = env.R2_BUCKET?.trim();
  if (!bucket) return null;
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2_BUCKET is set: also set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.');
  return createR2FileStorage({ accountId, accessKeyId, secretAccessKey, bucket, ...(env.R2_ENDPOINT?.trim() ? { endpoint: env.R2_ENDPOINT.trim() } : {}) });
}
