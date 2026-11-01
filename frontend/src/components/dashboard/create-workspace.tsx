'use client';
import { useState, type FormEvent } from 'react';
import { workspaceApi } from '@/lib/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Input,
  Textarea,
  toast,
} from '@/components/ui';
export function CreateWorkspace({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || name.trim().length < 2) return;
    setPending(true);
    setError(false);
    try {
      await workspaceApi.create({ name: name.trim(), description });
      setOpen(false);
      setName('');
      setDescription('');
      toast.success('Workspace created');
      onCreated();
    } catch {
      setError(true);
      toast.error('Workspace could not be created. Retry when you are ready.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">New</Button>
      </DialogTrigger>
      <DialogContent
        title="Create workspace"
        description="Give your team a shared place for documents and tasks."
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span>Name</span>
            <Input
              placeholder="My Project"
              required
              minLength={2}
              maxLength={50}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Description (optional)</span>
            <Textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              Workspace could not be created. Check the details and try Create again.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
