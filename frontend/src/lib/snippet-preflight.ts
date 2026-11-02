/** P04 rule set v1. Original bounded heuristics; no provider validation or third-party rule bundle. */
export const findingTypes = [
  'private-key',
  'github-token',
  'aws-access-key',
  'provider-key',
  'bearer-token',
  'credential-assignment',
  'credential-url',
] as const;
export type FindingType = (typeof findingTypes)[number];
export interface SafetyFinding {
  type: FindingType;
  maskedPreview: string;
}
export interface SnippetFields {
  title: string;
  code: string;
  language: string;
  description?: string;
}
export const safetyMask = (type: FindingType) => `[REDACTED:${type}]`;
export function redactSnippetText(text: string) {
  if (text.length > 256 * 1024) throw new Error('Snippet safety input limit exceeded');
  const types = new Set<FindingType>();
  const replace = (type: FindingType, pattern: RegExp) => {
    text = text.replace(pattern, () => {
      types.add(type);
      return safetyMask(type);
    });
  };
  replace(
    'private-key',
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|$)/g,
  );
  replace('github-token', /(?:gh[pousr]_[a-zA-Z0-9_-]{20,}|github_pat_[a-zA-Z0-9_]{20,})/g);
  replace('aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g);
  replace(
    'provider-key',
    /\b(?:sk-(?:proj-|ant-)?[a-zA-Z0-9_-]{16,}|gsk_[a-zA-Z0-9]{16,}|xox[baprs]-[a-zA-Z0-9-]{10,}|AIza[a-zA-Z0-9_-]{20,})\b/g,
  );
  replace('bearer-token', /\bBearer[ \t]+[a-zA-Z0-9._~+/-]{8,}={0,2}/gi);
  const names =
    '(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|password|passwd|secret|client[_-]?secret|aws[_-]?secret[_-]?access[_-]?key)';
  const prefix = `\\b(${names}[ \\t]*["']?[ \\t]*[:=][ \\t]*)`;
  text = text.replace(
    new RegExp(prefix + String.raw`(["'])((?:\\.|[^\\\r\n])*?)(?:\2|$)`, 'gmi'),
    (_match, before: string, quote: string, value: string) => {
      if (value.length < 8 || findingTypes.some((type) => value === safetyMask(type)))
        return _match;
      types.add('credential-assignment');
      return `${before}${quote}${safetyMask('credential-assignment')}${quote}`;
    },
  );
  text = text.replace(
    new RegExp(prefix + String.raw`([^\s"'\x60,;(){}\[\]]{8,})`, 'gmi'),
    (_match, before: string, value: string) => {
      if (/^(?:process\.env\.|os\.environ|\$)/.test(value)) return _match;
      types.add('credential-assignment');
      return before + safetyMask('credential-assignment');
    },
  );
  text = text.replace(
    /\b((?:postgres(?:ql)?|mysql|https?):\/\/)[^\s:/@]+:[^\s/@]+@/gi,
    (_match, scheme: string) => {
      types.add('credential-url');
      return `${scheme}${safetyMask('credential-url')}@`;
    },
  );
  return { text, findings: [...types].map((type) => ({ type, maskedPreview: safetyMask(type) })) };
}
export function preflightSnippet(input: SnippetFields) {
  const findings = new Map<FindingType, SafetyFinding>();
  const field = (text: string) => {
    const result = redactSnippetText(text);
    for (const finding of result.findings) findings.set(finding.type, finding);
    return result.text;
  };
  const content: SnippetFields = {
    title: field(input.title),
    code: field(input.code),
    language: field(input.language),
    ...(input.description === undefined ? {} : { description: field(input.description) }),
  };
  return { content, findings: [...findings.values()] };
}
