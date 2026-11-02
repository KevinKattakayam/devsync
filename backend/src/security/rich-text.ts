import { z } from 'zod';

/** Keep JSON as data; reject active URLs before TipTap normalizes its node schema. */
export const richTextSchema = z.json().superRefine((value, context) => {
  let nodes = 0;
  function valid(item: unknown, depth: number): boolean {
    if (++nodes > 10000 || depth > 32) return false;
    if (Array.isArray(item)) return item.every((child) => valid(child, depth + 1));
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) return false;
        if (['src', 'href'].includes(key) && child !== null) {
          if (typeof child !== 'string' || /[\u0000-\u0020]/.test(child)) return false;
          if (!/^(https?:\/\/|\/(?!\/)|#)/i.test(child)) return false;
        }
        if (!valid(child, depth + 1)) return false;
      }
    }
    return true;
  }
  if (JSON.stringify(value).length > 256 * 1024 || !valid(value, 0))
    context.addIssue({ code: 'custom', message: 'Invalid or oversized rich text' });
});
