'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { accountLifecycle, type DeletionPlan, type SessionSummary } from '@/lib/account-lifecycle';
import { Button, Dialog, DialogContent } from '@/components/ui';
export default function AccountSettings() {
  const { user } = useAuth();
  return <Account key={user?.id} />;
}
function Account() {
  const { user, logout } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [plan, setPlan] = useState<DeletionPlan>();
  const [sessions, setSessions] = useState<{ items: SessionSummary[]; hasMore: boolean }>();
  const [planError, setPlanError] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [selected, setSelected] = useState<SessionSummary>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let disposed = false;
    void accountLifecycle
      .plan()
      .then((v) => {
        if (!disposed) {
          setPlan(v);
          setPlanError(false);
        }
      })
      .catch(() => {
        if (!disposed) setPlanError(true);
      });
    void accountLifecycle
      .sessions()
      .then((v) => {
        if (!disposed) {
          setSessions(v);
          setSessionError(false);
        }
      })
      .catch(() => {
        if (!disposed) setSessionError(true);
      });
    return () => {
      disposed = true;
    };
  }, [attempt]);
  async function revoke() {
    if (!selected || pending) return;
    setPending(true);
    setNotice('');
    try {
      await accountLifecycle.revoke(selected.id);
      setSessions((v) => (v ? { ...v, items: v.items.filter((s) => s.id !== selected.id) } : v));
      setSelected(undefined);
      setNotice(
        'Clerk confirmed session revocation. Other connections recheck provider status within five seconds plus audit time.',
      );
      if (selected.current) await logout();
    } catch {
      setNotice(
        'Revocation or sign-out was not confirmed. Refresh and check your provider before relying on it.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Account &amp; sessions</h1>
        <p className="mt-2 text-sm text-muted-foreground">{user?.email}</p>
      </header>
      <section className="space-y-4" aria-labelledby="session-heading">
        <h2 id="session-heading" className="text-lg font-semibold">
          Clerk sessions
        </h2>
        <p>
          Clerk manages sign-in, passwords and provider recovery. Clearing stale browser cookies
          does not revoke a provider session.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            void logout().catch(() =>
              setNotice('Sign-out was not confirmed. Retry or use Clerk account recovery.'),
            );
          }}
        >
          Sign out of this browser
        </Button>
        <form method="post" action="/api/auth/reset?redirect=/sign-in">
          <Button type="submit" variant="ghost">
            Clear stale sign-in cookies
          </Button>
        </form>
        {sessionError ? (
          <p role="alert">
            Clerk session details are unavailable. No successful provider check is implied.
          </p>
        ) : !sessions ? (
          <p role="status">Loading provider sessions…</p>
        ) : sessions.items.length === 0 ? (
          <p>No active sessions returned by Clerk.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.items.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <span>
                  {s.current ? 'Current session' : 'Other session'} · last active{' '}
                  {new Date(s.lastActiveAt).toLocaleString()}
                </span>
                <Button variant="secondary" disabled={pending} onClick={() => setSelected(s)}>
                  Revoke {s.current ? 'current' : 'other'} session
                </Button>
              </li>
            ))}
          </ul>
        )}
        {sessions?.hasMore && (
          <p>
            Additional sessions are not shown. Contact your operator for a complete provider session
            review.
          </p>
        )}
      </section>
      <section className="space-y-4" aria-labelledby="deletion-heading">
        <h2 id="deletion-heading" className="text-lg font-semibold">
          Account deletion plan
        </h2>
        <p>
          This plan deletes nothing. Account erasure needs an operator review of ownership,
          retention, legal holds, provider copies and backups.
        </p>
        {planError ? (
          <p role="alert">
            Deletion prerequisites could not be loaded. Refresh before making ownership decisions.
          </p>
        ) : !plan ? (
          <p role="status">Loading deletion prerequisites…</p>
        ) : (
          <>
            <ul className="space-y-2">
              {plan.ownedWorkspaces.map((w) => (
                <li key={w.id}>
                  <a className="underline" href={`/workspace/${encodeURIComponent(w.id)}/settings`}>
                    {w.name}
                  </a>
                  :{' '}
                  {w.requiresTransfer
                    ? 'You are the only active owner. Transfer ownership before leaving.'
                    : 'Another active owner exists. Coordinate your departure.'}
                </li>
              ))}
            </ul>
            <ol className="list-decimal space-y-2 pl-6">
              {plan.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>
              No automated account deletion or cross-provider erasure is available here. Share this
              plan with your operator through your agreed private channel.
            </p>
          </>
        )}
      </section>
      <Button
        variant="secondary"
        onClick={() => {
          setSessionError(false);
          setPlanError(false);
          setSessions(undefined);
          setPlan(undefined);
          setAttempt((a) => a + 1);
        }}
      >
        Refresh account status
      </Button>
      {notice && <p role="status">{notice}</p>}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!pending && !open) setSelected(undefined);
        }}
      >
        <DialogContent
          title="Revoke Clerk session?"
          description="This signs out the selected provider session. Revoking the current session also signs out this browser."
        >
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={pending} onClick={() => setSelected(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={pending}
              onClick={() => {
                void revoke();
              }}
            >
              Confirm session revocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
