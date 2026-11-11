'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { Badge, Button, EmptyState, Input } from '@/components/ui';
import { WorkspaceLifecycle } from '@/components/settings/lifecycle';
import { GitHubExecution } from '@/components/settings/github-execution';
import { AiUsage } from '@/components/settings/ai-usage';
import { AutomationRules } from '@/components/settings/automation-rules';
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
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
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
  const showAi = !query.trim() || 'ai usage quota allowance'.includes(query.trim().toLowerCase());
  const showMembers = membersSection || memberMatch;
  // Search invitation rows inside the section without losing its in-view history on filter changes.
  const showInvitations =
    invitationsSection || invitationIndex.includes(normalized) || normalized.includes('@');
  const showAutomation =
    process.env.NEXT_PUBLIC_FEATURE_AUTOMATION === 'true' &&
    (!normalized || 'automation rules'.includes(normalized));
  const showGithub =
    owner &&
    (!normalized ||
      'github execution trail repository repositories ci checks'.includes(normalized));
  const showLifecycle =
    owner &&
    (!normalized || 'lifecycle ownership transfer export deletion setup'.includes(normalized));
  const showConnections = showGithub || showLifecycle;
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
          <Link
            href="/settings"
            className="rounded-md px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Account &amp; sessions
          </Link>
          <Link
            onClick={() => setQuery('')}
            href="#members"
            className="rounded-md px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Members &amp; roles
          </Link>
          <Link
            onClick={() => setQuery('')}
            href="#invitations"
            className="rounded-md px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Invitations
          </Link>
          {owner && showConnections && (
            <Link
              onClick={() => setQuery('')}
              href="#connections"
              className="rounded-md px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              Connections &amp; lifecycle
            </Link>
          )}
        </nav>
        <div className="min-w-0 space-y-6">
          {!owner && (
            <p className="rounded-lg bg-secondary p-4 text-sm leading-6">
              You have {role.toLowerCase()} access. Only workspace owners can change roles, remove
              members or manage invitations.
            </p>
          )}
          {!showMembers && !showInvitations && !showAi && !showAutomation && !showConnections && (
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
          {(showAi || showAutomation) && (
            <section
              id="usage-and-automation"
              aria-labelledby="usage-heading"
              className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
            >
              <header>
                <h2 id="usage-heading" className="text-lg font-semibold">
                  Usage &amp; automation
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Review workspace allowances and, when enabled, workspace rules.
                </p>
              </header>
              {showAi && <AiUsage workspaceId={workspaceId} />}
              {showAutomation && (
                <AutomationRules
                  key={`${attempt}:${role}`}
                  workspaceId={workspaceId}
                  owner={owner}
                  members={workspace.members}
                />
              )}
            </section>
          )}
          <section
            id="members"
            hidden={!showMembers}
            className="min-w-0 scroll-mt-4 rounded-xl border bg-card p-4 sm:p-5"
            aria-labelledby="members-heading"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="members-heading" tabIndex={-1} className="text-lg font-semibold">
                Members &amp; roles
              </h2>
              <p className="text-xs text-muted-foreground">
                {workspace.members.length} members at last refresh
              </p>
            </div>
            <p className="mb-4 text-sm leading-5 text-muted-foreground">
              Review current workspace members and the role used for access checks. Owner-only
              changes require confirmation.
            </p>
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
            className="min-w-0 scroll-mt-4 rounded-xl border bg-card p-4 sm:p-5"
            aria-labelledby="invitations-heading"
          >
            <h2 id="invitations-heading" tabIndex={-1} className="mb-4 text-lg font-semibold">
              Invitations
            </h2>
            <p className="mb-4 text-sm leading-5 text-muted-foreground">
              Review invitation links and their current status. New links are recipient-bound and do
              not add a member until accepted.
            </p>
            <Invitations
              key={`${attempt}:${role}`}
              workspaceId={workspaceId}
              owner={owner}
              onSearchIndexChange={setInvitationIndex}
              query={invitationsSection ? '' : normalized}
            />
          </section>
          {owner && showConnections && (
            <section
              id="connections"
              aria-labelledby="connections-heading"
              className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
            >
              <header>
                <h2 id="connections-heading" className="text-lg font-semibold">
                  Connections &amp; lifecycle
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Owner-only panels. Recorded GitHub activity does not confirm current installation
                  access or a deployment.
                </p>
              </header>
              {showGithub && (
                <details onToggle={(event) => setGithubOpen(event.currentTarget.open)}>
                  <summary className="cursor-pointer rounded-lg border p-4 font-medium focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
                    GitHub execution trail
                  </summary>
                  {githubOpen && <GitHubExecution key={workspaceId} workspaceId={workspaceId} />}
                </details>
              )}
              {showLifecycle && (
                <details onToggle={(event) => setLifecycleOpen(event.currentTarget.open)}>
                  <summary className="cursor-pointer rounded-lg border p-4 font-medium focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
                    Workspace setup &amp; lifecycle
                  </summary>
                  {lifecycleOpen && (
                    <div className="pt-5">
                      <WorkspaceLifecycle
                        key={`${attempt}:${workspace.id}`}
                        workspace={workspace}
                        actorId={actorId}
                        refresh={refresh}
                      />
                    </div>
                  )}
                </details>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
