/**
 * A key for one intent made on this device, sent with a post or a message and again with its repeat (bad connections
 * pass, J-N1): the server answers the repeat with the first result. A random UUID (crypto.randomUUID where there is
 * one; built from getRandomValues on browsers before it).
 */
export function newRequestKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
