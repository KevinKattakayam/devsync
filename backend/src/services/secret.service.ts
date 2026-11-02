import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';
const AUTH_TAG_BYTES = 16;

function key() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value))
    throw new Error('ENCRYPTION_KEY must be a 32-byte hexadecimal value');
  return Buffer.from(value, 'hex');
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string) {
  // Allows a deliberate, one-time migration from old plaintext connections.
  if (!value.startsWith(PREFIX)) return value;
  const parts = value.split(':');
  const [, , ivValue, tagValue, payload] = parts;
  if (
    parts.length !== 5 ||
    ![ivValue, tagValue, payload].every((part) => /^[A-Za-z0-9_-]*$/.test(part))
  )
    throw new Error('Invalid encrypted secret envelope');
  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  if (iv.length !== 12 || tag.length !== AUTH_TAG_BYTES)
    throw new Error('Invalid encrypted secret envelope');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
