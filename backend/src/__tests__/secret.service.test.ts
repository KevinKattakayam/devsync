import { decryptSecret, encryptSecret } from '../services/secret.service';

describe('webhook secret encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });
  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('round-trips encrypted values without retaining plaintext', () => {
    const encrypted = encryptSecret('github-webhook-secret');
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('github-webhook-secret');
    expect(decryptSecret(encrypted)).toBe('github-webhook-secret');
  });

  it('rejects invalid key material', () => {
    process.env.ENCRYPTION_KEY = 'invalid';
    expect(() => encryptSecret('value')).toThrow('ENCRYPTION_KEY');
  });
});

it('rejects short GCM authentication tags and tampered envelopes', () => {
  const original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = 'b'.repeat(64);
  try {
    const encrypted = encryptSecret('synthetic-roundtrip-fixture');
    for (const length of [0, 4, 8, 12, 15]) {
      const fields = encrypted.split(':');
      fields[3] = Buffer.from(fields[3], 'base64url').subarray(0, length).toString('base64url');
      expect(() => decryptSecret(fields.join(':'))).toThrow('Invalid encrypted secret envelope');
    }
    const fields = encrypted.split(':');
    const tag = Buffer.from(fields[3], 'base64url');
    tag[0] ^= 1;
    fields[3] = tag.toString('base64url');
    expect(() => decryptSecret(fields.join(':'))).toThrow();
    expect(() => decryptSecret(encrypted + ':extra')).toThrow('Invalid encrypted secret envelope');
  } finally {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  }
});
