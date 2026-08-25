function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

/** W3C-sized trace ID propagated to the API without exposing user identity. */
export function browserTraceId(): string {
  return randomHex(16);
}
