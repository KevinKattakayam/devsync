import { decryptSecret, encryptSecret } from '../services/secret.service';

describe('webhook secret encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  beforeEach(() => { process.env.ENCRYPTION_KEY = 'a'.repeat(64); });
  afterAll(() => { process.env.ENCRYPTION_KEY = originalKey; });

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
