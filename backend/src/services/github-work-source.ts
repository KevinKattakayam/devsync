import { sign } from 'crypto';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors';

const bindingSchema = z.object({
  workspaceId: z.string().min(1).max(191),
  repositoryId: z.string().regex(/^[1-9][0-9]*$/),
  installationId: z.string().regex(/^[1-9][0-9]*$/),
  owner: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  name: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
});
export type GitHubWorkBinding = z.infer<typeof bindingSchema>;
type Transport = typeof fetch;
type TokenIssuer = (binding: GitHubWorkBinding) => Promise<string>;
const unavailable = () => new AppError('GitHub source verification unavailable', 503);
const headers = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

/** No PAT fallback: request a read-only token restricted to the configured installation/repository. */
export function appInstallationToken(transport: Transport = fetch): TokenIssuer {
  return async (binding) => {
    try {
      binding = bindingSchema.parse(binding);
      const appId = process.env.GITHUB_APP_ID,
        key = process.env.GITHUB_APP_PRIVATE_KEY;
      if (!appId || !key || !/^[a-zA-Z0-9_-]{1,191}$/.test(appId)) throw unavailable();
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const body = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: appId, iat: now - 30, exp: now + 300 })}`;
      const jwt = `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
      const repositoryId = Number(binding.repositoryId);
      if (!Number.isSafeInteger(repositoryId)) throw unavailable();
      const response = await transport(
        `https://api.github.com/app/installations/${binding.installationId}/access_tokens`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
          headers: { ...headers(jwt), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repository_ids: [repositoryId],
            permissions: { issues: 'read', pull_requests: 'read' },
          }),
        },
      );
      if (!response.ok) throw unavailable();
      const token = z
        .object({ token: z.string().min(1).max(16384), expires_at: z.iso.datetime() })
        .parse(await response.json());
      if (Date.parse(token.expires_at) <= Date.now()) throw unavailable();
      return token.token;
    } catch {
      throw unavailable();
    }
  };
}

/** Provider proof only. Callers must resolve current local membership/repository binding before AND after I/O. */
export class GitHubWorkSource {
  constructor(
    private readonly token: TokenIssuer = appInstallationToken(),
    private readonly transport: Transport = fetch,
  ) {}
  async resolve(
    workspaceId: string,
    input: GitHubWorkBinding,
    kind: 'issue' | 'pull_request',
    number: number,
  ) {
    const parsed = bindingSchema.safeParse(input);
    if (
      !parsed.success ||
      parsed.data.workspaceId !== workspaceId ||
      !Number.isSafeInteger(number) ||
      number < 1 ||
      !['issue', 'pull_request'].includes(kind)
    )
      throw new NotFoundError('Source unavailable');
    const binding = parsed.data;
    try {
      const token = await this.token(binding);
      const endpoint = `https://api.github.com/repos/${binding.owner}/${binding.name}`;
      const response = await this.transport(
        `${endpoint}/${kind === 'issue' ? 'issues' : 'pulls'}/${number}`,
        {
          headers: headers(token),
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
        },
      );
      if (response.status === 404 || response.status === 410)
        throw new NotFoundError('Source unavailable');
      if (!response.ok) throw unavailable();
      const value = z
        .object({
          number: z.number().int(),
          title: z.string().min(1).max(2000),
          html_url: z.string().max(2048),
          repository_url: z.string().optional(),
          pull_request: z.unknown().optional(),
          base: z.object({ repo: z.object({ id: z.number().int() }) }).optional(),
        })
        .parse(await response.json());
      const url = `https://github.com/${binding.owner}/${binding.name}/${kind === 'issue' ? 'issues' : 'pull'}/${number}`;
      if (
        value.number !== number ||
        value.html_url !== url ||
        (kind === 'pull_request'
          ? String(value.base?.repo.id) !== binding.repositoryId
          : value.repository_url !== endpoint || value.pull_request !== undefined)
      )
        throw new NotFoundError('Source unavailable');
      return { kind, repositoryId: binding.repositoryId, number, title: value.title, url };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw unavailable();
    }
  }
}
