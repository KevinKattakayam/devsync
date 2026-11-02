import { test, expect, BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { requireRouteContract } from '../../src/contracts';
import { login } from './identities';

test('Zod response contracts match real authenticated resource and service operations', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    viewer = await browser.newContext();
  const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;
  if (!adminUrl || !new URL(adminUrl).pathname.startsWith('/devsync_e2e_'))
    throw new Error('Disposable contract database required');
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  const api = 'http://127.0.0.1:5501';
  const id = (value: unknown) => z.object({ id: z.string() }).parse(value).id;
  async function checked(
    context: BrowserContext,
    method: string,
    template: string,
    path: string,
    data?: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) {
    const response = await context.request.fetch(`${api}${path}`, { method, data, headers });
    expect(response.status()).toBe(status);
    const contract = requireRouteContract(method, template).responses[String(status)];
    if (!contract) throw new Error(`Undocumented response ${method} ${template} ${status}`);
    if (contract.noContent) {
      expect(await response.text()).toBe('');
      return null;
    }
    const body: unknown = await response.json();
    if (!contract.schema) throw new Error('Missing response schema');
    contract.schema.parse(body);
    return body;
  }
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    await checked(owner, 'GET', '/api/v1/health', '/api/health');
    await checked(owner, 'GET', '/api/v1/ready', '/api/ready', undefined, 503);
    await checked(owner, 'POST', '/api/v1/auth/sync', '/api/auth/sync');
    await checked(owner, 'GET', '/api/v1/auth/me', '/api/auth/me');
    await checked(owner, 'PATCH', '/api/v1/auth/me', '/api/auth/me', { name: 'Sample owner' });
    const workspace = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces',
        '/api/workspaces',
        { name: `Contract workspace ${Date.now()}` },
        201,
      ),
    );
    const base = `/api/workspaces/${workspace}`;
    await checked(owner, 'GET', '/api/v1/workspaces', '/api/workspaces');
    await checked(owner, 'GET', '/api/v1/workspaces/{id}', base);
    await checked(owner, 'PATCH', '/api/v1/workspaces/{id}', base, {
      description: 'Transport contract verification',
    });
    await checked(owner, 'GET', '/api/v1/workspaces/{id}/activities', `${base}/activities`);
    const document = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/documents',
        `${base}/documents`,
        { title: 'Contract document' },
        201,
      ),
    );
    const documentPath = `/api/documents/${document}`;
    const doc = await checked(owner, 'GET', '/api/v1/documents/{id}', documentPath);
    await checked(owner, 'GET', '/api/v1/workspaces/{id}/documents', `${base}/documents`);
    await checked(owner, 'PATCH', '/api/v1/documents/{id}', documentPath, {
      title: 'Contract document updated',
    });
    await checked(owner, 'PUT', '/api/v1/documents/{id}/content', `${documentPath}/content`, {
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      crdtRevision: z.object({ crdtRevision: z.number() }).parse(doc).crdtRevision,
    });
    await checked(
      owner,
      'GET',
      '/api/v1/workspaces/{id}/search',
      `${base}/search?q=Contract&limit=4`,
    );
    const snippet = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/snippets',
        `${base}/snippets`,
        { title: 'Contract snippet', code: 'const verified = true;', language: 'javascript' },
        201,
      ),
    );
    await checked(owner, 'GET', '/api/v1/workspaces/{id}/snippets', `${base}/snippets`);
    await checked(owner, 'PATCH', '/api/v1/snippets/{snippetId}', `/api/snippets/${snippet}`, {
      description: 'Verified response',
    });
    await checked(
      owner,
      'POST',
      '/api/v1/snippets/execute',
      '/api/snippets/execute',
      { code: 'Never executed', language: 'javascript' },
      503,
    );
    const board = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/boards',
        `${base}/boards`,
        { name: 'Contract board' },
        201,
      ),
    );
    const column = id(
      await checked(
        owner,
        'POST',
        '/api/v1/tasks/boards/{boardId}/columns',
        `/api/tasks/boards/${board}/columns`,
        { name: 'Contract source' },
        201,
      ),
    );
    const target = id(
      await checked(
        owner,
        'POST',
        '/api/v1/tasks/boards/{boardId}/columns',
        `/api/tasks/boards/${board}/columns`,
        { name: 'Contract target' },
        201,
      ),
    );
    await checked(
      owner,
      'PATCH',
      '/api/v1/tasks/columns/{columnId}',
      `/api/tasks/columns/${column}`,
      { name: 'Updated source' },
    );
    const task = id(
      await checked(
        owner,
        'POST',
        '/api/v1/tasks/columns/{columnId}/tasks',
        `/api/tasks/columns/${column}/tasks`,
        { title: 'Contract task' },
        201,
      ),
    );
    await checked(owner, 'PATCH', '/api/v1/tasks/tasks/{taskId}', `/api/tasks/tasks/${task}`, {
      description: 'Updated task',
    });
    await checked(
      owner,
      'PATCH',
      '/api/v1/tasks/tasks/{taskId}/move',
      `/api/tasks/tasks/${task}/move`,
      { columnId: target, position: 0 },
    );
    await checked(owner, 'GET', '/api/v1/workspaces/{id}/boards', `${base}/boards`);
    const member = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/invite',
        `${base}/invite`,
        { email: 'sample-editor@devsync.invalid', role: 'EDITOR' },
        201,
      ),
    );
    await checked(
      owner,
      'PATCH',
      '/api/v1/workspaces/{id}/members/{memberId}',
      `${base}/members/${member}`,
      { role: 'VIEWER' },
    );
    await checked(
      owner,
      'DELETE',
      '/api/v1/workspaces/{id}/members/{memberId}',
      `${base}/members/${member}`,
    );
    const invitation = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/invitations',
        `${base}/invitations`,
        { email: 'sample-viewer@devsync.invalid', role: 'VIEWER' },
        201,
      ),
    );
    await checked(
      viewer,
      'POST',
      '/api/v1/workspaces/invitations/{invitationId}/accept',
      `/api/workspaces/invitations/${invitation}/accept`,
      {},
    );
    const revoked = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/invitations',
        `${base}/invitations`,
        { email: 'sample-viewer@devsync.invalid', role: 'VIEWER' },
        201,
      ),
    );
    await checked(
      owner,
      'DELETE',
      '/api/v1/workspaces/{id}/invitations/{invitationId}',
      `${base}/invitations/${revoked}`,
      undefined,
      204,
    );
    const webhookSecret = randomBytes(24).toString('hex'),
      repositoryId = `contract-${Date.now()}`;
    const repository = id(
      await checked(
        owner,
        'POST',
        '/api/v1/workspaces/{id}/github-repositories',
        `${base}/github-repositories`,
        { repositoryId, owner: 'fixture', name: 'contracts', webhookSecret },
        201,
      ),
    );
    await checked(
      owner,
      'GET',
      '/api/v1/workspaces/{id}/github-repositories',
      `${base}/github-repositories`,
    );
    await checked(
      owner,
      'PATCH',
      '/api/v1/workspaces/{id}/github-repositories/{repositoryId}',
      `${base}/github-repositories/${repository}`,
      { name: 'updated' },
    );
    const github = JSON.stringify({ repository: { id: repositoryId } });
    await checked(owner, 'POST', '/api/v1/webhooks/github', '/api/webhooks/github', github, 202, {
      'Content-Type': 'application/json',
      'x-github-event': 'ping',
      'x-github-delivery': randomUUID(),
      'x-hub-signature-256': `sha256=${createHmac('sha256', webhookSecret).update(github).digest('hex')}`,
    });
    const billingSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!billingSecret) throw new Error('Disposable Stripe signing fixture missing');
    const stripe = JSON.stringify({
        id: 'evt_contract',
        type: 'contract.ignored',
        data: { object: {} },
      }),
      timestamp = Math.floor(Date.now() / 1000);
    await checked(owner, 'POST', '/api/v1/webhooks/stripe', '/api/webhooks/stripe', stripe, 200, {
      'Content-Type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${createHmac('sha256', billingSecret).update(`${timestamp}.${stripe}`).digest('hex')}`,
    });
    const credential = randomBytes(32).toString('hex'),
      externalId = `contract-${Date.now()}`;
    await admin.scimProvisioningToken.create({
      data: {
        workspaceId: workspace,
        tokenHash: createHash('sha256').update(credential).digest('hex'),
      },
    });
    const authorization = { Authorization: `Bearer ${credential}` };
    await checked(
      owner,
      'POST',
      '/scim/v2/Users',
      '/scim/v2/Users',
      { externalId, userName: 'sample-viewer@devsync.invalid', roles: [{ value: 'VIEWER' }] },
      201,
      authorization,
    );
    await checked(
      owner,
      'PATCH',
      '/scim/v2/Users/{externalId}',
      `/scim/v2/Users/${externalId}`,
      { active: false },
      200,
      authorization,
    );
    await checked(
      owner,
      'DELETE',
      '/scim/v2/Users/{externalId}',
      `/scim/v2/Users/${externalId}`,
      undefined,
      204,
      authorization,
    );
    await checked(
      owner,
      'DELETE',
      '/api/v1/workspaces/{id}/github-repositories/{repositoryId}',
      `${base}/github-repositories/${repository}`,
      undefined,
      204,
    );
    await checked(owner, 'DELETE', '/api/v1/tasks/tasks/{taskId}', `/api/tasks/tasks/${task}`);
    await checked(
      owner,
      'DELETE',
      '/api/v1/tasks/columns/{columnId}',
      `/api/tasks/columns/${column}`,
    );
    await checked(owner, 'DELETE', '/api/v1/snippets/{snippetId}', `/api/snippets/${snippet}`);
    await checked(owner, 'DELETE', '/api/v1/documents/{id}', documentPath);
    const service = process.env.SUPERADMIN_SERVICE_TOKEN;
    if (!service) throw new Error('Disposable administrative fixture missing');
    await checked(
      owner,
      'GET',
      '/api/v1/superadmin/metrics',
      '/api/superadmin/metrics',
      undefined,
      200,
      { 'x-superadmin-service-token': service },
    );
    await checked(
      owner,
      'POST',
      '/api/v1/superadmin/workspaces/{workspaceId}/kill-switch',
      `/api/superadmin/workspaces/${workspace}/kill-switch`,
      { reason: 'Contract verification complete' },
      200,
      { 'x-superadmin-service-token': service },
    );
  } finally {
    await admin.$disconnect();
    await owner.close();
    await viewer.close();
  }
});
