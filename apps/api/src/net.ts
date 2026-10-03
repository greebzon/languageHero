/**
 * The rate-limit key of a client: its IPv4 address, or the /64 network of an IPv6 one (a single
 * home connection owns billions of IPv6 addresses, so per-address limits would not hold).
 */
export function clientKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1]!;
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => (g || '0').toLowerCase())
    .join(':')}::/64`;
}
