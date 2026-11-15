'use client';
import { useState } from 'react';
import type * as Y from 'yjs';
import { exportLocalDraft } from '@/lib/draft-export';
export function DraftExport({
  document,
  principal,
  room,
  onPurge,
}: {
  document: Y.Doc;
  principal: string;
  room: string;
  onPurge?: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [purgeConfirmed, setPurgeConfirmed] = useState(false);
  const [purging, setPurging] = useState(false);
  async function purge() {
    if (!purgeConfirmed || !onPurge || purging) return;
    setPurging(true);
    try {
      await onPurge();
    } catch {
      setMessage(
        'Removal could not be confirmed. Keep your export and check local storage access.',
      );
    } finally {
      setPurging(false);
    }
  }
  function download() {
    if (!confirmed) return;
    try {
      const file = exportLocalDraft(document, principal, room);
      const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = 'devsync-local-draft.json';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      const revoke = URL.revokeObjectURL.bind(URL);
      window.setTimeout(() => revoke(url), 1000);
      setMessage('Download requested. Confirm the file is present before closing this draft.');
    } catch {
      setMessage('Export unavailable or draft exceeds the 8 MiB limit. Keep this page open.');
    }
  }
  return (
    <details className="mb-4 text-sm">
      <summary className="cursor-pointer">Local draft recovery</summary>
      <p className="my-2">
        Export the current local replica as an unencrypted Yjs recovery file. It may contain private
        content and local actions. Store it privately. Export does not confirm browser persistence
        or server acknowledgement.
      </p>
      <label className="block my-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />{' '}
        I understand this file contains unencrypted workspace data.
      </label>
      <button type="button" className="underline" disabled={!confirmed} onClick={download}>
        Export local draft
      </button>
      {message && <p role="status">{message}</p>}
      {onPurge && (
        <fieldset className="mt-4 space-y-2">
          <legend>Remove the saved browser draft</legend>
          <p>
            This can discard unconfirmed edits. Export first and verify the file. Other
            current-version tabs will disconnect from this draft. Close older DevSync tabs first;
            they do not honor the purge marker.
          </p>
          <p>
            The server document and downloaded exports are not deleted. Automatic local reload stays
            blocked after removal. Restoring a recovery file is currently disabled. Close this tab
            afterward to release its in-memory copy.
          </p>
          <label className="block">
            <input
              type="checkbox"
              checked={purgeConfirmed}
              onChange={(event) => setPurgeConfirmed(event.target.checked)}
            />{' '}
            I have preserved any needed edits and confirm removal of this saved browser draft.
          </label>
          <button
            type="button"
            disabled={!purgeConfirmed || purging}
            className="underline"
            onClick={() => void purge()}
          >
            Remove saved browser draft
          </button>
        </fieldset>
      )}
    </details>
  );
}
