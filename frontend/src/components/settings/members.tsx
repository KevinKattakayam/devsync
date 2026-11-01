'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { WorkspaceMember } from '@/types';
import { workspaceAccess, type MemberRole } from '@/lib/workspace-access';
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Select,
  toast,
} from '@/components/ui';

export function Members({
  workspaceId,
  members,
  actorId,
  owner,
  query,
  refresh,
}: {
  workspaceId: string;
  members: WorkspaceMember[];
  actorId: string;
  owner: boolean;
  query: string;
  refresh: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, MemberRole>>({});
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [change, setChange] = useState<{
    member: WorkspaceMember;
    role?: MemberRole;
    remove?: boolean;
  }>();
  const mounted = useRef(true);
  const locked = useRef(false);
  const origin = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const notifications = useRef<(string | number)[]>([]);
  useEffect(() => {
    mounted.current = true;
    const ids = notifications.current;
    return () => {
      mounted.current = false;
      for (const id of ids) toast.dismiss(id);
    };
  }, []);
  const visible = members.filter(
    (member) =>
      !removed.includes(member.id) &&
      `${member.user.name} ${member.user.email} ${overrides[member.id] || member.role}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function updateRole(
    member: WorkspaceMember,
    next: MemberRole,
    previous: MemberRole,
    undo = false,
  ) {
    if (!owner) return;
    if (locked.current) {
      toast.error('Wait for the current change to finish.', {
        action: {
          label: 'Retry undo',
          onClick: () => {
            void updateRole(member, next, previous, undo);
          },
        },
      });
      return;
    }
    locked.current = true;
    setBusy(true);
    setError('');
    setOverrides((values) => ({ ...values, [member.id]: next }));
    try {
      const saved = await workspaceAccess.updateRole(workspaceId, member.id, next);
      if (mounted.current) setOverrides((values) => ({ ...values, [member.id]: saved.role }));
      if (!mounted.current) return;
      notifications.current.push(
        toast.success(
          undo ? 'Role change undone' : 'Member role updated',
          undo
            ? {}
            : {
                duration: 8000,
                action: {
                  label: 'Undo',
                  onClick: () => {
                    if (mounted.current) void updateRole(member, previous, next, true);
                  },
                },
              },
        ),
      );
    } catch {
      if (mounted.current) {
        setOverrides((values) => ({ ...values, [member.id]: previous }));
        setError('Role could not be changed. Refresh to check permissions, then retry.');
      }
      toast.error('Role change was not confirmed');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!change || locked.current || !owner) return;
    const { member, role, remove } = change;
    setChange(undefined);
    if (role) {
      await updateRole(member, role, overrides[member.id] || member.role);
      return;
    }
    if (!remove) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setRemoved((ids) => [...ids, member.id]);
    try {
      await workspaceAccess.remove(workspaceId, member.id);
      toast.success('Member removed. A new invitation is required to rejoin.');
    } catch {
      if (mounted.current) {
        setRemoved((ids) => ids.filter((id) => id !== member.id));
        setError('Member could not be removed. Refresh to check permissions, then retry.');
      }
      toast.error('Removal was not confirmed');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-secondary p-4"
        >
          <p className="min-w-0 flex-1 text-sm">{error}</p>
          <Button variant="secondary" onClick={refresh}>
            Refresh access
          </Button>
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyState
          title="No matching members"
          description="Try a name, email address or role, or clear the settings search."
        />
      ) : (
        <ul aria-label="Workspace members" className="space-y-2">
          {visible.map((member) => {
            const role = overrides[member.id] || member.role;
            return (
              <li
                key={member.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-lg bg-card px-4 py-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={member.user.name || member.user.email} src={member.user.avatar} />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {member.user.name || member.user.email}
                      {member.user.id === actorId && (
                        <span className="ml-2 text-xs text-muted-foreground">You</span>
                      )}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {member.user.email}
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {owner && member.user.id !== actorId ? (
                    <>
                      <div className="w-36">
                        <Select
                          triggerId={`${prefix}-${member.id}`}
                          label={`Role for ${member.user.name || member.user.email}`}
                          value={role}
                          disabled={busy}
                          options={[
                            { value: 'VIEWER', label: 'Viewer' },
                            { value: 'EDITOR', label: 'Editor' },
                            { value: 'OWNER', label: 'Owner' },
                          ]}
                          onValueChange={(value) => {
                            if (value === 'OWNER' || value === 'EDITOR' || value === 'VIEWER') {
                              origin.current = document.getElementById(`${prefix}-${member.id}`);
                              setChange({ member, role: value });
                            }
                          }}
                        />
                      </div>
                      {role !== 'OWNER' && (
                        <Button
                          variant="ghost"
                          size="compact"
                          disabled={busy}
                          onClick={(event) => {
                            origin.current = event.currentTarget;
                            setChange({ member, remove: true });
                          }}
                        >
                          Remove {member.user.name || member.user.email}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Badge>{role.toLowerCase()}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Owners manage access. Editors edit workspace content. Viewers have read-only access. Your
        own role must be changed by another owner.
      </p>
      <Dialog
        open={!!change}
        onOpenChange={(open) => {
          if (!open) setChange(undefined);
        }}
      >
        <DialogContent
          ref={dialog}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            dialog.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (origin.current?.isConnected
              ? origin.current
              : document.getElementById('members-heading')
            )?.focus();
          }}
          title={change?.remove ? 'Remove member?' : 'Change member role?'}
          description={
            change?.remove
              ? 'Access is revoked when removal succeeds. Rejoining requires a new verified invitation.'
              : 'This changes workspace permissions and may close active editing sessions.'
          }
        >
          <p className="break-words text-sm">
            {change?.member.user.name || change?.member.user.email}
            {change?.role && (
              <>
                {' '}
                will become <strong>{change.role.toLowerCase()}</strong>.
              </>
            )}
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setChange(undefined)}>
              Cancel
            </Button>
            <Button
              variant={change?.remove ? 'destructive' : 'primary'}
              onClick={() => {
                void confirm();
              }}
            >
              {change?.remove ? 'Confirm removal' : 'Confirm role change'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
