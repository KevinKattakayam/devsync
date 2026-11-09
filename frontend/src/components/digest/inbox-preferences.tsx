'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { digestApi, type InboxDeliveryPreference } from '@/lib/async-digest';

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
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
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
      setBusy(false);
    }
  }
  async function previewBatches() {
    setBusy(true);
    setStatus('');
    try {
      setPreview(await digestApi.batchPreview(workspaceId));
    } catch (error) {
      if (isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403))
        onAccessLost();
      setPreview(undefined);
      setStatus('Could not preview batches. Check current access and retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer">Notification scheduling preferences</summary>
      <p className="text-sm">
        These settings are saved for future delivery. No email, push, or scheduled delivery is
        active.
      </p>
      {value && (
        <form onSubmit={save} className="space-y-3">
          <label className="block">
            Time zone{' '}
            <input
              className="border"
              value={value.timezone}
              maxLength={100}
              required
              onChange={(event) => setValue({ ...value, timezone: event.target.value })}
            />
          </label>
          <label className="block">
            Quiet hours start{' '}
            <input
              type="time"
              className="border"
              value={timeText(value.quietStart)}
              onChange={(event) => setValue({ ...value, quietStart: minutes(event.target.value) })}
            />
          </label>
          <label className="block">
            Quiet hours end{' '}
            <input
              type="time"
              className="border"
              value={timeText(value.quietEnd)}
              onChange={(event) => setValue({ ...value, quietEnd: minutes(event.target.value) })}
            />
          </label>
          <label className="block">
            Batch interval{' '}
            <select
              className="border"
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
          <button type="submit" disabled={busy} className="underline">
            Save preferences
          </button>
        </form>
      )}
      {value && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void previewBatches()}
          className="underline"
        >
          Preview batch windows
        </button>
      )}
      {preview && (
        <div>
          <p>
            Preview only, based on saved preferences and the first page of unread activity.
            Automation failures are not included; no delivery is scheduled.
          </p>
          <ol>
            {preview.batches.map((batch, index) => (
              <li key={`${batch.eligibleAt}:${index}`}>
                {batch.activityIds.length} events eligible at{' '}
                <time dateTime={batch.eligibleAt}>{batch.eligibleAt}</time>
              </li>
            ))}
          </ol>
          {preview.nextCursor && <p>More events are available in later pages.</p>}
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </details>
  );
}
