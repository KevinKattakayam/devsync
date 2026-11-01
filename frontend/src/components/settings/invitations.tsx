'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { workspaceAccess, type PendingInvitation } from '@/lib/workspace-access';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Select,
  toast,
} from '@/components/ui';
import Link from 'next/link';

interface InvitationRow {
  key: string;
  email: string;
  role: PendingInvitation['role'];
  invitation?: PendingInvitation;
  state: 'creating' | 'pending' | 'revoking' | 'revoked' | 'unknown' | 'error';
}
export function Invitations({
  workspaceId,
  owner,
  query,
  onSearchIndexChange,
}: {
  workspaceId: string;
  owner: boolean;
  query: string;
  onSearchIndexChange: (value: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PendingInvitation['role']>('VIEWER');
  const [rows, setRows] = useState<InvitationRow[]>([]);
  useEffect(() => {
    onSearchIndexChange(
      rows
        .map((row) => `${row.email} ${row.role}`)
        .join(' ')
        .toLowerCase(),
    );
  }, [rows, onSearchIndexChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState<InvitationRow>();
  const receipt = useRef<{ body: string; key: string } | undefined>(undefined);
  const mounted = useRef(true);
  const revoking = useRef(new Set<string>());
  const revoked = useRef(new Set<string>());
  const origin = useRef<HTMLElement | null>(null);
  const notifications = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    const ids = notifications.current;
    return () => {
      mounted.current = false;
      for (const id of ids) toast.dismiss(id);
    };
  }, []);
  function setRow(key: string, patch: Partial<InvitationRow>) {
    if (mounted.current)
      setRows((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }
  async function revokeLink(row: InvitationRow, undo = false) {
    if (!row.invitation || !owner || revoking.current.has(row.key) || revoked.current.has(row.key))
      return;
    revoking.current.add(row.key);
    setRow(row.key, { state: 'revoking' });
    try {
      await workspaceAccess.revoke(workspaceId, row.invitation.id);
      revoked.current.add(row.key);
      setRow(row.key, { state: 'revoked' });
      if (mounted.current)
        toast.success(undo ? 'Invitation creation undone' : 'Invitation revoked', { id: row.key });
    } catch {
      setRow(row.key, { state: 'unknown' });
      toast.error('Revocation was not confirmed. The invitation may no longer be pending.', {
        id: row.key,
      });
      if (mounted.current)
        setError(
          'Could not revoke this invitation. Check your access and retry; accepted invitations cannot be revoked.',
        );
    } finally {
      revoking.current.delete(row.key);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!owner || busy) return;
    const normalized = email.trim().toLowerCase();
    const body = `${normalized}:${role}`;
    if (receipt.current?.body !== body) receipt.current = { body, key: crypto.randomUUID() };
    const key = receipt.current.key;
    const row: InvitationRow = { key, email: normalized, role, state: 'creating' };
    setBusy(true);
    setError('');
    setRows((items) => [...items.filter((item) => item.key !== key), row]);
    let undoRequested = false;
    let saved: InvitationRow | undefined;
    const undo = () => {
      undoRequested = true;
      if (saved) void revokeLink(saved, true);
    };
    notifications.current.add(key);
    toast.loading('Creating invitation…', { id: key, action: { label: 'Undo', onClick: undo } });
    try {
      const invitation = await workspaceAccess.invite(workspaceId, normalized, role, key);
      saved = { ...row, invitation, state: 'pending' };
      setRow(key, saved);
      if (mounted.current) {
        setEmail('');
        receipt.current = undefined;
      }
      if (undoRequested) await revokeLink(saved, true);
      else if (mounted.current)
        toast.success('Invitation link created. No email was sent.', {
          id: key,
          duration: 8000,
          action: { label: 'Undo', onClick: undo },
        });
    } catch {
      setRow(key, { state: 'error' });
      if (mounted.current)
        setError(
          'Invitation could not be created. Your details are kept; try Create invitation again.',
        );
      toast.error('Invitation was not confirmed', { id: key });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const visible = rows.filter((row) =>
    `${row.email} ${row.role} ${row.state}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (!owner)
    return (
      <EmptyState
        title="Invitations are managed by owners"
        description="Ask a workspace owner to invite someone or change workspace access."
      />
    );
  return (
    <>
      <form onSubmit={submit} className="mb-6 space-y-4">
        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <label className="block space-y-2 text-sm">
            <span>Recipient email</span>
            <Input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              placeholder="teammate@company.com"
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm">Invitation role</p>
            <Select
              label="Invitation role"
              value={role}
              disabled={busy}
              options={[
                { value: 'VIEWER', label: 'Viewer' },
                { value: 'EDITOR', label: 'Editor' },
              ]}
              onValueChange={(value) => {
                if (value === 'VIEWER' || value === 'EDITOR') setRole(value);
              }}
            />
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          The recipient must accept with the matching verified email. Links expire after seven days.
          Creating a link does not send an email.
        </p>
        <Button type="submit" pending={busy}>
          Create invitation
        </Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <h3 className="mb-2 text-sm font-medium">Links created in this view</h3>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">
        This is not a complete invitation history. Reloading clears this view, not the invitations.
        Status reflects actions performed here.
      </p>
      {visible.length === 0 ? (
        <EmptyState
          title="No links in this view"
          description="Create a recipient-bound invitation above. Share its link directly with that person."
        />
      ) : (
        <ul aria-label="Invitation links" className="space-y-4">
          {visible.map((row) => (
            <li key={row.key} className="min-w-0 rounded-lg bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{row.email}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {row.role.toLowerCase()}
                  </p>
                </div>
                <Badge>
                  {row.state === 'creating'
                    ? 'Creating…'
                    : row.state === 'pending'
                      ? 'Created'
                      : row.state === 'unknown'
                        ? 'Status unconfirmed'
                        : row.state}
                </Badge>
              </div>
              {row.invitation && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Expires{' '}
                  <time dateTime={row.invitation.expiresAt}>
                    {new Date(row.invitation.expiresAt).toLocaleDateString('en', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </p>
              )}
              {row.invitation && row.state !== 'revoked' && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={`/invitations/${encodeURIComponent(row.invitation.id)}`}
                    className="min-h-9 break-all rounded-md px-2 py-2 text-sm text-primary underline underline-offset-4"
                  >
                    Open invitation link
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (row.invitation)
                        void navigator.clipboard
                          .writeText(
                            `${location.origin}/invitations/${encodeURIComponent(row.invitation.id)}`,
                          )
                          .then(() => toast.success('Invitation link copied'))
                          .catch(() =>
                            toast.error(
                              'Copy failed. Use Open invitation link and copy its address.',
                            ),
                          );
                    }}
                  >
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={row.state === 'revoking'}
                    onClick={(event) => {
                      origin.current = event.currentTarget;
                      setRevoke(row);
                    }}
                  >
                    {row.state === 'unknown' ? 'Retry revocation' : 'Revoke invitation'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!revoke}
        onOpenChange={(open) => {
          if (!open) setRevoke(undefined);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (origin.current?.isConnected
              ? origin.current
              : document.getElementById('invitations-heading')
            )?.focus();
          }}
          title="Revoke invitation?"
          description="The existing link will stop accepting new members after revocation succeeds. An accepted membership is not removed."
        >
          <p className="break-all text-sm">{revoke?.email}</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRevoke(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (revoke) void revokeLink(revoke);
                setRevoke(undefined);
              }}
            >
              Confirm revocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
