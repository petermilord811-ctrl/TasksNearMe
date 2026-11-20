/**
 * The part of a client's address that per-address rate limits count (security review 2026-11-20): an IPv4 address
 * whole, an IPv6 address by its /64 network. A home, a phone or a server is given a whole /64, so counting each IPv6
 * address on its own would give one client a fresh limit for every try. IPv4 written as IPv6 (::ffff:203.0.113.9)
 * counts as IPv4. Turnstile and audit rows keep the address as it came.
 */
export function addressForLimits(ip: string): string {
  const value = (ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0] ?? '').trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return mapped[1]!;
  if (!value.includes(':')) return value;
  // A dotted IPv4 tail (64:ff9b::203.0.113.9) fills two groups.
  const groupsOf = (part: string) => (part === '' ? [] : part.split(':').flatMap((group) => (group.includes('.') ? ['0', '0'] : [group])));
  const [head = '', tail] = value.split('::');
  const left = groupsOf(head);
  const right = tail === undefined ? [] : groupsOf(tail);
  const groups = tail === undefined ? left : [...left, ...Array.from({ length: Math.max(0, 8 - left.length - right.length) }, () => '0'), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, '') || '0')
    .join(':')}::/64`;
}
