'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { digestApi, type InboxDeliveryPreference } from '@/lib/async-digest';
import { Button, Input } from '@/components/ui';

const timeText = (value: number | null) =>
  value === null
    ? ''
    : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const minutes = (value: string) =>
  value === '' ? null : Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
export function InboxPreferences({
  workspaceId,
  onAccessLost,
}: {
  workspaceId: string;
  onAccessLost: () => void;
}) {
  const [value, setValue] = useState<InboxDeliveryPreference>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null);
  const [preview, setPreview] = useState<{
    batches: { activityIds: string[]; eligibleAt: string }[];
    nextCursor: string | null;
  }>();
  useEffect(() => {
    let active = true;
    void digestApi
      .notificationPreferences(workspaceId)
      .then((result) => {
        if (active) setValue(result);
      })
      .catch((error: unknown) => {
        if (active) {
          if (
            isAxiosError(error) &&
            (error.response?.status === 401 || error.response?.status === 403)
          )
            onAccessLost();
          else setStatus('Preferences unavailable.');
        }
      });
    return () => {
      active = false;
    };
  }, [workspaceId, onAccessLost]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    setBusy('save');
    setStatus('');
    try {
      await digestApi.saveNotificationPreferences(workspaceId, value);
      setPreview(undefined);
      setStatus('Preferences saved.');
    } catch (error) {
      if (isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403))
        onAccessLost();
      setStatus('Could not save preferences. Check your timezone, quiet hours and access.');
    } finally {
      setBusy(null);
    }
  }
  async function previewBatches() {
    setBusy('preview');
    setStatus('');
    try {
      setPreview(await digestApi.batchPreview(workspaceId));
    } catch (error) {
      if (isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403))
        onAccessLost();
      setPreview(undefined);
      setStatus('Could not preview batches. Check current access and retry.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <details className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <summary className="w-fit cursor-pointer rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Notification scheduling preferences
      </summary>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        These settings are saved for future delivery. No email, push, or scheduled delivery is
        active.
      </p>
      {value && (
        <form onSubmit={save} className="mt-4 space-y-4">
          <fieldset disabled={busy !== null} className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Notification scheduling preferences</legend>
            <label className="block space-y-2 text-sm font-medium">
              Time zone
              <Input
                className="font-normal"
                value={value.timezone}
                maxLength={100}
                required
                onChange={(event) => setValue({ ...value, timezone: event.target.value })}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Quiet hours start
              <Input
                type="time"
                className="font-normal"
                value={timeText(value.quietStart)}
                onChange={(event) =>
                  setValue({ ...value, quietStart: minutes(event.target.value) })
                }
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Quiet hours end
              <Input
                type="time"
                className="font-normal"
                value={timeText(value.quietEnd)}
                onChange={(event) => setValue({ ...value, quietEnd: minutes(event.target.value) })}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Batch interval
              <select
                className="ui-input font-normal"
                value={value.batchMinutes}
                onChange={(event) => {
                  const interval = Number(event.target.value);
                  if (interval === 15 || interval === 60 || interval === 1440)
                    setValue({ ...value, batchMinutes: interval });
                }}
              >
                <option value={15}>15 minutes</option>
                <option value={60}>1 hour</option>
                <option value={1440}>1 day</option>
              </select>
            </label>
          </fieldset>
          <Button type="submit" pending={busy === 'save'} disabled={busy !== null}>
            Save preferences
          </Button>
        </form>
      )}
      {!value && !status && (
        <p role="status" className="mt-4 text-sm">
          Loading preferences…
        </p>
      )}
      {value && (
        <Button
          type="button"
          variant="secondary"
          pending={busy === 'preview'}
          disabled={busy !== null}
          className="mt-3"
          onClick={() => void previewBatches()}
        >
          Preview batch windows
        </Button>
      )}
      {preview && (
        <div role="status" aria-live="polite" className="mt-4 rounded-md bg-secondary p-4">
          <p className="text-sm leading-6">
            Preview only, based on saved preferences and the first page of unread activity.
            Automation failures are not included; no delivery is scheduled.
          </p>
          {!preview.batches.length ? (
            <p className="mt-2 text-sm text-muted-foreground">No activity batches are eligible.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {preview.batches.map((batch, index) => (
                <li key={`${batch.eligibleAt}:${index}`} className="flex flex-wrap gap-x-1">
                  <span>{batch.activityIds.length} events eligible at</span>{' '}
                  <time dateTime={batch.eligibleAt}>{batch.eligibleAt}</time>
                </li>
              ))}
            </ol>
          )}
          {preview.nextCursor && <p>More events are available in later pages.</p>}
        </div>
      )}
      {status && (
        <p role="status" aria-live="polite" className="mt-3 text-sm">
          {status}
        </p>
      )}
    </details>
  );
}
