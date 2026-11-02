import { EventEmitter } from 'events';
/** Local immediate eviction; other nodes recheck DB every stale interval and inbound frame. */
export const collaborationAcl = new EventEmitter();
export function notifyCollaborationAclChange(workspaceId: string, userId: string): void {
  collaborationAcl.emit('revoke', workspaceId, userId);
}
