'use client';
import { useState } from 'react';
import type * as Y from 'yjs';
import { exportLocalDraft } from '@/lib/draft-export';
export function DraftExport({
  document,
  principal,
  room,
}: {
  document: Y.Doc;
  principal: string;
  room: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
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
    </details>
  );
}
