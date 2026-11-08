import { GitHubWorkSource, appInstallationToken } from '../services/github-work-source';
import { generateKeyPairSync, verify } from 'crypto';
const binding = {
  workspaceId: 'workspace',
  repositoryId: '123',
  installationId: '456',
  owner: 'approved',
  name: 'repository',
};
const resource = {
  number: 7,
  title: 'Provider title',
  html_url: 'https://github.com/approved/repository/pull/7',
  base: { repo: { id: 123 } },
};
it('rejects a foreign workspace before obtaining provider authority', async () => {
  const token = jest.fn(async () => 'fixture');
  const provider = new GitHubWorkSource(token, async () => new Response(JSON.stringify(resource)));
  await expect(provider.resolve('foreign', binding, 'pull_request', 7)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(token).not.toHaveBeenCalled();
});
it('verifies the repository identity and returns a canonical source pointer', async () => {
  const provider = new GitHubWorkSource(
    async () => 'fixture',
    async () => new Response(JSON.stringify(resource)),
  );
  await expect(provider.resolve('workspace', binding, 'pull_request', 7)).resolves.toEqual({
    kind: 'pull_request',
    repositoryId: '123',
    number: 7,
    title: 'Provider title',
    url: resource.html_url,
  });
});
it.each([
  { ...resource, base: { repo: { id: 999 } } },
  { ...resource, number: 8 },
  { ...resource, html_url: 'https://attacker.invalid/pull/7' },
])('rejects provider records that do not prove the configured endpoint', async (value) => {
  const provider = new GitHubWorkSource(
    async () => 'fixture',
    async () => new Response(JSON.stringify(value)),
  );
  await expect(provider.resolve('workspace', binding, 'pull_request', 7)).rejects.toThrow();
});
it('does not forward a credential through a redirect or surface provider errors', async () => {
  const fetcher = jest.fn(async () => new Response('PRIVATE_PROVIDER_DETAIL', { status: 302 }));
  const provider = new GitHubWorkSource(async () => 'fixture', fetcher);
  await expect(provider.resolve('workspace', binding, 'pull_request', 7)).rejects.toMatchObject({
    statusCode: 503,
    message: 'GitHub source verification unavailable',
  });
  expect(fetcher.mock.calls).toHaveLength(1);
});
it('returns not-found for a withdrawn source without a cached title', async () => {
  const provider = new GitHubWorkSource(
    async () => 'fixture',
    async () => new Response('{}', { status: 404 }),
  );
  await expect(provider.resolve('workspace', binding, 'pull_request', 7)).rejects.toMatchObject({
    statusCode: 404,
  });
});

it('validates issue identity and never accepts a pull request through the issue endpoint', async () => {
  const value = {
    number: 7,
    title: 'Issue',
    html_url: 'https://github.com/approved/repository/issues/7',
    repository_url: 'https://api.github.com/repos/approved/repository',
  };
  const provider = new GitHubWorkSource(
    async () => 'fixture',
    async () => new Response(JSON.stringify(value)),
  );
  expect((await provider.resolve('workspace', binding, 'issue', 7)).kind).toBe('issue');
  const wrong = new GitHubWorkSource(
    async () => 'fixture',
    async () => new Response(JSON.stringify({ ...value, pull_request: {} })),
  );
  await expect(wrong.resolve('workspace', binding, 'issue', 7)).rejects.toMatchObject({
    statusCode: 404,
  });
});

it('denies malformed identities, provider failures and invalid responses without exposing details', async () => {
  const provider = new GitHubWorkSource(async () => {
    throw new Error('PRIVATE');
  });
  await expect(provider.resolve('workspace', binding, 'issue', 0)).rejects.toMatchObject({
    statusCode: 404,
  });
  await expect(
    provider.resolve('workspace', { ...binding, installationId: '../foreign' }, 'issue', 7),
  ).rejects.toMatchObject({ statusCode: 404 });
  await expect(provider.resolve('workspace', binding, 'issue', 7)).rejects.toMatchObject({
    statusCode: 503,
    message: 'GitHub source verification unavailable',
  });
  const invalid = new GitHubWorkSource(
    async () => 'fixture',
    async () => new Response('{}'),
  );
  await expect(invalid.resolve('workspace', binding, 'issue', 7)).rejects.toMatchObject({
    statusCode: 503,
  });
});

it('issues narrowly scoped installation authority using an actual signed App JWT (fixture transport only)', async () => {
  const originalId = process.env.GITHUB_APP_ID,
    originalKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  try {
    process.env.GITHUB_APP_ID = '123';
    process.env.GITHUB_APP_PRIVATE_KEY = pair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    let validSignature = false,
      scoped = false;
    const issuer = appInstallationToken(async (url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization') || '';
      const parts = authorization.slice(7).split('.');
      validSignature = verify(
        'RSA-SHA256',
        Buffer.from(parts.slice(0, 2).join('.')),
        pair.publicKey,
        Buffer.from(parts[2], 'base64url'),
      );
      const body: unknown = JSON.parse(String(init?.body));
      scoped =
        String(url) === 'https://api.github.com/app/installations/456/access_tokens' &&
        JSON.stringify(body) ===
          JSON.stringify({
            repository_ids: [123],
            permissions: { issues: 'read', pull_requests: 'read' },
          }) &&
        init?.redirect === 'error';
      return new Response(
        JSON.stringify({
          token: 'fixture',
          expires_at: new Date(Date.now() + 60000).toISOString(),
        }),
      );
    });
    expect((await issuer(binding)).length > 0).toBe(true);
    expect(validSignature && scoped).toBe(true);
    const expired = appInstallationToken(
      async () =>
        new Response(JSON.stringify({ token: 'fixture', expires_at: '2000-01-01T00:00:00Z' })),
    );
    await expect(expired(binding)).rejects.toMatchObject({ statusCode: 503 });
    const denied = appInstallationToken(async () => new Response('{}', { status: 403 }));
    await expect(denied(binding)).rejects.toMatchObject({ statusCode: 503 });
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    await expect(issuer(binding)).rejects.toMatchObject({ statusCode: 503 });
  } finally {
    if (originalId === undefined) delete process.env.GITHUB_APP_ID;
    else process.env.GITHUB_APP_ID = originalId;
    if (originalKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
    else process.env.GITHUB_APP_PRIVATE_KEY = originalKey;
  }
});
