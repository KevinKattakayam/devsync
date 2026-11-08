'use client';
import { useEffect, useState } from 'react';
import { accountLifecycle, type LifecyclePlan } from '@/lib/account-lifecycle';
import { workspaceApi } from '@/lib/api';
import type { Workspace, WorkspaceMember } from '@/types';
import { Button, Dialog, DialogContent, Input, Select } from '@/components/ui';
export function WorkspaceLifecycle({
  workspace,
  actorId,
  refresh,
}: {
  workspace: Workspace;
  actorId: string;
  refresh: () => void;
}) {
  const [plan, setPlan] = useState<LifecyclePlan>();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<'transfer' | 'export'>();
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description || '');
  useEffect(() => {
    let disposed = false;
    void accountLifecycle
      .workspace(workspace.id)
      .then((v) => {
        if (!disposed) setPlan(v);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [workspace.id]);
  async function submit() {
    if (pending || !action || confirm !== workspace.name) return;
    setPending(true);
    setNotice('');
    try {
      if (action === 'export') {
        const request = await accountLifecycle.requestExport(workspace.id, confirm);
        setNotice(
          `Export request ${request.id} recorded for owner/operator review. No file, email or export job was generated.`,
        );
        setPlan((v) =>
          v ? { ...v, requests: [request, ...v.requests.filter((r) => r.id !== request.id)] } : v,
        );
      } else {
        await accountLifecycle.transfer(workspace.id, target, confirm);
        setNotice('Ownership transferred. Your role is now editor.');
        refresh();
      }
      setAction(undefined);
      setConfirm('');
    } catch {
      setNotice(
        'The operation was not confirmed. Check current membership and workspace name, then refresh before retrying.',
      );
    } finally {
      setPending(false);
    }
  }
  const candidates: WorkspaceMember[] = workspace.members.filter((m) => m.user.id !== actorId);
  return (
    <section id="lifecycle" className="space-y-5" aria-labelledby="lifecycle-heading">
      <h2 id="lifecycle-heading" className="text-lg font-semibold">
        Workspace setup & lifecycle
      </h2>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          void workspaceApi
            .update(workspace.id, { name: name.trim(), description })
            .then(() => {
              setNotice('Workspace details saved.');
              refresh();
            })
            .catch(() => setNotice('Workspace details were not saved.'))
            .finally(() => setPending(false));
        }}
      >
        <label className="block">
          Workspace name
          <Input
            required
            minLength={2}
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="block">
          Description
          <Input
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
          />
        </label>
        <Button type="submit" variant="secondary" pending={pending}>
          Save workspace details
        </Button>
      </form>
      {failed ? (
        <p role="alert">
          Lifecycle prerequisites are unavailable. Refresh access before making changes.
        </p>
      ) : !plan ? (
        <p role="status">Loading lifecycle prerequisites…</p>
      ) : (
        <>
          <p>
            Transfer promotes an existing active member to owner and makes you an editor in one
            transaction. The new owner controls access. Your former editing connection may close.
          </p>
          <Select
            label="New workspace owner"
            value={target}
            onValueChange={setTarget}
            options={candidates.map((m) => ({ value: m.id, label: m.user.name || m.user.email }))}
          />
          <Button
            variant="secondary"
            disabled={!target || pending}
            onClick={() => {
              setConfirm('');
              setAction('transfer');
            }}
          >
            Transfer ownership
          </Button>
          <p>
            Workspace export needs owner/operator review for confidential data, scope and retention.
            Requests are recorded here; no automatic download or external delivery is available.
          </p>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setConfirm('');
              setAction('export');
            }}
          >
            Request workspace export
          </Button>
          <ul>
            {plan.requests.map((r) => (
              <li key={r.id} className="break-all text-sm">
                Request {r.id}: review required
              </li>
            ))}
          </ul>
          <h3 className="font-semibold">Workspace deletion prerequisites</h3>
          <p>
            Confirm member notice, recovery needs, export scope and retention/legal holds with the
            operator first. {plan.retainedCrdtBackups} retained CRDT backup records may prevent
            database deletion. Workspace deletion does not erase Clerk identities, downloaded
            copies, queues or provider/backups. No workspace deletion is performed from this screen.
          </p>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !pending) setAction(undefined);
        }}
      >
        <DialogContent
          title={action === 'transfer' ? 'Confirm ownership transfer' : 'Confirm export request'}
          description="Type the current workspace name exactly. This confirmation is rechecked by the server."
        >
          <label className="block">
            Confirm workspace name
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={pending}
            />
          </label>
          <p className="my-3 break-words">{workspace.name}</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={pending} onClick={() => setAction(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={confirm !== workspace.name || pending}
              pending={pending}
              onClick={() => {
                void submit();
              }}
            >
              {action === 'transfer' ? 'Confirm transfer' : 'Record export request'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
