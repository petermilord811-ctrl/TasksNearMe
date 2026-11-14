import { getHeapStatistics } from 'node:v8';
import { isLocalRequest } from '@/shared/local-request';
import { devHelpersOn } from '@/shared/dev-helpers';

/**
 * Dev only. The dev server's own memory, in MB: the JS heap (used, allocated and its limit) apart from what lies
 * outside it (Buffers, and Turbopack's native memory within `rss`). The sessions sharing the 7.7 GB VPS read it
 * when the server nears its cap (scripts/dev-supervisor.mjs), to tell which part grows.
 */
export async function GET(request: Request) {
  // Only on this machine (also checked in src/proxy.ts): never through a public proxy.
  if (!isLocalRequest((name) => request.headers.get(name))) return new Response('Not found', { status: 404 });
  if (!devHelpersOn()) return new Response(null, { status: 404 });
  const mb = (bytes: number) => Math.round(bytes / 1048576);
  const usage = process.memoryUsage();
  return Response.json(
    {
      rss: mb(usage.rss),
      heapUsed: mb(usage.heapUsed),
      heapTotal: mb(usage.heapTotal),
      heapLimit: mb(getHeapStatistics().heap_size_limit),
      external: mb(usage.external),
      arrayBuffers: mb(usage.arrayBuffers),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
