/**
 * The most a webhook may send. Providers' events are a few kilobytes (a Stripe invoice with many lines stays well
 * under this), and the body is held in memory before its signature can be checked.
 */
export const WEBHOOK_MAX_BYTES = 2 * 1024 * 1024;

/**
 * A request's body as text (UTF-8, as `request.text()`), or null when it's larger than `maxBytes`: refused by its
 * Content-Length before any of it is read, or as soon as what has arrived passes the limit. For endpoints anyone can
 * call before a signature is checked, so a huge body can't fill the server's memory (sweep 2026-11-20, security review).
 */
export async function readTextUpTo(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
