'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Badge, Button, EmptyState, Input } from '@/components/ui';
import { Members } from '@/components/settings/members';
import { Invitations } from '@/components/settings/invitations';
import { SettingsError, SettingsLoading } from '@/components/settings/states';
import { loadWorkspaceAccess } from '@/lib/workspace-access';
import { RefreshCw, Search } from 'lucide-react';

type Access = Awaited<ReturnType<typeof loadWorkspaceAccess>>;
export default function WorkspaceSettings() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  return <Settings key={`${user?.id}:${id}`} workspaceId={id} />;
}
function Settings({ workspaceId }: { workspaceId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ attempt: number; data?: Access; error?: boolean }>();
  const [query, setQuery] = useState('');
  const [invitationIndex, setInvitationIndex] = useState('');
  useEffect(() => {
    let disposed = false;
    void loadWorkspaceAccess(workspaceId)
      .then((data) => {
        if (!disposed) setSnapshot({ attempt, data });
      })
      .catch(() => {
        if (!disposed) setSnapshot({ attempt, error: true });
      });
    return () => {
      disposed = true;
    };
  }, [workspaceId, attempt]);
  const refresh = () => setAttempt((value) => value + 1);
  if (!snapshot || snapshot.attempt !== attempt) return <SettingsLoading />;
  if (!snapshot.data || snapshot.error)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <h1 className="mb-6 text-[28px] font-semibold leading-9">Workspace settings</h1>
        <SettingsError retry={refresh} />
      </div>
    );
  const { workspace, actorId, role } = snapshot.data;
  const owner = role === 'OWNER';
  const normalized = query.trim().toLowerCase();
  const membersSection =
    !normalized || 'members roles people access permissions'.includes(normalized);
  const invitationsSection =
    !normalized || 'invitations invite email sharing links'.includes(normalized);
  const memberMatch = workspace.members.some((member) =>
    `${member.user.name} ${member.user.email} ${member.role}`.toLowerCase().includes(normalized),
  );
  const showMembers = membersSection || memberMatch;
  // Search invitation rows inside the section without losing its in-view history on filter changes.
  const showInvitations =
    invitationsSection || invitationIndex.includes(normalized) || normalized.includes('@');
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-24 md:px-8" data-settings>
      <header className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div>
          <p className="mb-2 break-words text-xs text-muted-foreground">{workspace.name}</p>
          <h1 className="text-[28px] font-semibold leading-9">Workspace settings</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Manage who can access this workspace and how they join.
          </p>
          <div className="mt-3">
            <Badge>{role.toLowerCase()}</Badge>
          </div>
        </div>
        <Button variant="ghost" aria-label="Refresh workspace access" onClick={refresh}>
          <RefreshCw aria-hidden="true" className="size-4" />
        </Button>
      </header>
      <div className="mb-8">
        <label className="block space-y-2 text-sm">
          <span>Search settings</span>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sections, names, email addresses or roles"
              className="pl-10"
            />
          </div>
        </label>
      </div>
      <div className="grid min-w-0 gap-8 md:grid-cols-[10rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex flex-wrap content-start gap-2 md:flex-col"
        >
          <a
            onClick={() => setQuery('')}
            href="#members"
            className="rounded-md px-3 py-2 text-sm hover:bg-secondary"
          >
            Members & roles
          </a>
          <a
            onClick={() => setQuery('')}
            href="#invitations"
            className="rounded-md px-3 py-2 text-sm hover:bg-secondary"
          >
            Invitations
          </a>
        </nav>
        <div className="min-w-0 space-y-10">
          {!owner && (
            <p className="rounded-lg bg-secondary p-4 text-sm leading-6">
              You have {role.toLowerCase()} access. Only workspace owners can change roles, remove
              members or manage invitations.
            </p>
          )}
          {!showMembers && !showInvitations && (
            <EmptyState
              title="No settings match"
              description="Try members, invitations, a name or an email address."
              action={
                <Button variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          )}
          <section
            id="members"
            hidden={!showMembers}
            className="min-w-0 scroll-mt-4"
            aria-labelledby="members-heading"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="members-heading" tabIndex={-1} className="text-lg font-semibold">
                Members & roles
              </h2>
              <p className="text-xs text-muted-foreground">
                {workspace.members.length} members at last refresh
              </p>
            </div>
            <Members
              key={`${attempt}:${role}`}
              workspaceId={workspaceId}
              members={workspace.members}
              actorId={actorId}
              owner={owner}
              query={membersSection ? '' : normalized}
              refresh={refresh}
            />
          </section>
          <section
            id="invitations"
            hidden={!showInvitations}
            className="min-w-0 scroll-mt-4"
            aria-labelledby="invitations-heading"
          >
            <h2 id="invitations-heading" tabIndex={-1} className="mb-4 text-lg font-semibold">
              Invitations
            </h2>
            <Invitations
              key={`${attempt}:${role}`}
              workspaceId={workspaceId}
              owner={owner}
              onSearchIndexChange={setInvitationIndex}
              query={invitationsSection ? '' : normalized}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
