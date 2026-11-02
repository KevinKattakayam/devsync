'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { workspaceApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export default function InvitationPage() {
  const { id } = useParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  async function accept() {
    setBusy(true);
    try {
      const response = await workspaceApi.acceptInvitation(id);
      const member = z.object({ workspaceId: z.string(), role: z.string() }).parse(response.data);
      setWorkspaceId(member.workspaceId);
      setMessage(`Invitation accepted. Your role is ${member.role}.`);
    } catch (error) {
      setMessage(errorMessage(error, 'Unable to accept invitation'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-xl font-bold">Workspace invitation</h1>
      <p>Accept using the account with the verified email this invitation was addressed to.</p>
      <button
        disabled={busy || !!workspaceId}
        onClick={() => void accept()}
        className="px-4 py-2 rounded gradient-primary text-white"
      >
        Accept invitation
      </button>
      <p role="status">{message}</p>
      {workspaceId && <Link href={`/workspace/${workspaceId}`}>Open workspace</Link>}
    </div>
  );
}
