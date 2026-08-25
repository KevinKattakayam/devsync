import { currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const payload = z.object({ reason: z.string().min(3).max(500) });

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }): Promise<NextResponse> {
  const user = await currentUser();
  if (user?.publicMetadata.systemRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = payload.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { workspaceId } = await context.params;
  const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:5000'}/api/superadmin/workspaces/${encodeURIComponent(workspaceId)}/kill-switch`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-superadmin-service-token': process.env.SUPERADMIN_SERVICE_TOKEN || '' }, body: JSON.stringify(body.data), cache: 'no-store' });
  return NextResponse.json(await response.json(), { status: response.status });
}
