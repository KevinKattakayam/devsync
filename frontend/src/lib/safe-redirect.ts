/** Only same-origin root-relative reset destinations; reject slash/backslash authority tricks. */
export function resetDestination(value: string | null, origin: string): URL {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return new URL('/login', origin);
  const target = new URL(value, origin);
  return target.origin === new URL(origin).origin ? target : new URL('/login', origin);
}
