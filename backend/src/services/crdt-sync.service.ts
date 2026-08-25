import * as Y from 'yjs';
import { assertTokenBalance, recordTokenUsage } from './billing.service';

const ACTION_MAP = 'devsync:ai-actions';
const MAX_ACTIONS_PER_SYNC = 20;

export interface OfflineAiAction {
  id: string;
  type: 'complete' | 'summarize' | 'improve';
  prompt: string;
  estimatedTokens: number;
  status: 'pending' | 'authorized' | 'rejected';
  rejectionReason?: 'PAYMENT_REQUIRED' | 'INVALID';
}

function parseAction(value: unknown): OfflineAiAction | null {
  if (typeof value !== 'string') return null;
  try {
    const action = JSON.parse(value) as OfflineAiAction;
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(action.id) || !['complete', 'summarize', 'improve'].includes(action.type) || typeof action.prompt !== 'string' || action.prompt.length > 32_000 || !Number.isInteger(action.estimatedTokens) || action.estimatedTokens < 1 || action.estimatedTokens > 8_000) return null;
    return action;
  } catch { return null; }
}

/**
 * Reconciles only the billable-action map. It never rolls back the surrounding
 * Yjs document, therefore manual offline text is always durable. A rejection
 * becomes CRDT state that all clients can render as “payment required”.
 */
export async function reconcileOfflineAiActions(document: Y.Doc, workspaceId: string): Promise<void> {
  const actions = document.getMap<string>(ACTION_MAP);
  const entries = [...actions.entries()].slice(0, MAX_ACTIONS_PER_SYNC);
  for (const [key, raw] of entries) {
    const action = parseAction(raw);
    if (!action) { actions.set(key, JSON.stringify({ id: key, type: 'complete', prompt: '', estimatedTokens: 0, status: 'rejected', rejectionReason: 'INVALID' })); continue; }
    if (action.status !== 'pending') continue;
    try {
      await assertTokenBalance(workspaceId);
      // `id` is globally generated client-side and TokenUsage.requestId is
      // unique, making reconnect/replay idempotent.
      await recordTokenUsage(workspaceId, `offline-ai:${action.id}`, action.estimatedTokens, 'offline_ai_reservation');
      actions.set(key, JSON.stringify({ ...action, status: 'authorized' }));
    } catch {
      actions.set(key, JSON.stringify({ ...action, status: 'rejected', rejectionReason: 'PAYMENT_REQUIRED' }));
    }
  }
}
