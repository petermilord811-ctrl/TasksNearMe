/**
 * US phone numbers (launch markets are US-only). Isomorphic: used by the contract schemas, the
 * server, and the UI.
 */

/**
 * "(512) 555-0167", "512.555.0167", "+1 512 555 0167" → "+15125550167".
 * Returns null for anything that isn't a valid US (NANP) number.
 */
export function normalizeUsPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !digits.startsWith('1')) return null;
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

/** "+15125550167" → "(512) 555-0167". Returns the input unchanged when it isn't a US E.164 number. */
export function formatUsPhone(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}

/** "+15125550167" → "(512) •••-••67": enough to recognize your own number, not to read it out. */
export function maskUsPhone(e164: string): string {
  const match = /^\+1(\d{3})\d{5}(\d{2})$/.exec(e164);
  return match ? `(${match[1]}) •••-••${match[2]}` : '•••';
}
