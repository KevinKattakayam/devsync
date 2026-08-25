import { Hocuspocus, onAuthenticatePayload, onLoadDocumentPayload, onStoreDocumentPayload, onConnectPayload, onDisconnectPayload } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma';
import { reconcileOfflineAiActions } from './crdt-sync.service';

interface CollaborationRoom {
  workspaceId: string;
  documentId?: string;
  type: 'document' | 'kanban' | 'workspace' | 'other';
}

function parseRoom(name: string): CollaborationRoom {
  const docMatch = /^document:([^:]+):([^:]+)$/.exec(name);
  if (docMatch) {
    return { workspaceId: docMatch[1], documentId: docMatch[2], type: 'document' };
  }
  const kanbanMatch = /^kanban:([^:]+)$/.exec(name);
  if (kanbanMatch) {
    return { workspaceId: kanbanMatch[1], type: 'kanban' };
  }
  const wsMatch = /^workspace:([^:]+)$/.exec(name);
  if (wsMatch) {
    return { workspaceId: wsMatch[1], type: 'workspace' };
  }
  return { workspaceId: '', documentId: name, type: 'document' };
}

/**
 * Hocuspocus CRDT collaboration server.
 *
 * Replaces the raw y-websocket approach with production-grade features:
 * - onAuthenticate: Clerk token validation + workspace membership check
 * - Database extension: Postgres-backed Yjs state persistence with debounce
 * - Built-in awareness (cursor) broadcasting
 * - Automatic reconnection handling
 */

let hocuspocus: Hocuspocus | null = null;

export function getHocuspocus(): Hocuspocus {
  if (!hocuspocus) throw new Error('Hocuspocus not initialized — call setupHocuspocusServer first');
  return hocuspocus;
}

export function setupHocuspocusServer(httpServer: HttpServer): Hocuspocus {
  hocuspocus = new Hocuspocus({
    name: 'devsync-collab',
    quiet: process.env.NODE_ENV === 'production',
    timeout: 30000,
    debounce: 3000,         // Debounce DB writes by 3s
    maxDebounce: 10000,     // Force flush after 10s max

    async onAuthenticate(data: onAuthenticatePayload): Promise<{ user: { id: string; name: string } }> {
      const token = data.token;
      if (!token) {
        throw new Error('Authentication required');
      }

      try {
        const claims = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        const clerkId = String(claims.sub || '');
        if (!clerkId) throw new Error('Invalid token claims');

        // Resolve local user
        let user = await prisma.user.findUnique({ where: { clerkId } });
        if (!user) {
          const { syncClerkUser } = await import('../middleware/auth.middleware');
          user = await syncClerkUser(clerkId);
        }

        const room = parseRoom(data.documentName);
        let targetWorkspaceId = room.workspaceId;

        if (room.type === 'document' && room.documentId && !targetWorkspaceId) {
          const document = await prisma.document.findUnique({
            where: { id: room.documentId },
            select: { workspaceId: true },
          });
          if (document) {
            targetWorkspaceId = document.workspaceId;
          }
        }

        if (targetWorkspaceId) {
          const member = await prisma.workspaceMember.findUnique({
            where: {
              userId_workspaceId: {
                userId: user.id,
                workspaceId: targetWorkspaceId,
              },
            },
          });

          if (!member) throw new Error('Not a workspace member');
        }

        // Return user info for awareness/cursors
        return {
          user: {
            id: user.id,
            name: user.name || user.email || 'Anonymous',
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        throw new Error(message);
      }
    },

    async onConnect({ documentName }: onConnectPayload): Promise<void> {
      console.log(`[Hocuspocus] Client connected to room: ${documentName}`);
    },

    async onDisconnect({ documentName }: onDisconnectPayload): Promise<void> {
      console.log(`[Hocuspocus] Client disconnected from room: ${documentName}`);
    },

    extensions: [
      new Database({
        async fetch(data: onLoadDocumentPayload): Promise<Uint8Array | null> {
          const room = parseRoom(data.documentName);
          if (room.documentId) {
            try {
              const record = await prisma.document.findUnique({
                where: { id: room.documentId },
                select: { yjsState: true },
              });

              if (record?.yjsState) {
                return new Uint8Array(record.yjsState);
              }
            } catch (error) {
              console.error(`[Hocuspocus] Failed to load document ${room.documentId}:`, error);
            }
          }

          return null;
        },

        async store(data: onStoreDocumentPayload): Promise<void> {
          const room = parseRoom(data.documentName);
          if (room.documentId) {
            try {
              if (room.workspaceId) {
                await reconcileOfflineAiActions(data.document, room.workspaceId);
              }
              const stateUpdate = Y.encodeStateAsUpdate(data.document);
              await prisma.document.update({
                where: { id: room.documentId },
                data: { yjsState: Buffer.from(stateUpdate) },
              });
            } catch (error) {
              console.error(`[Hocuspocus] Failed to persist document ${room.documentId}:`, error);
            }
          }
        },
      }),
    ],
  });

  // Create a dedicated WebSocket server for Hocuspocus
  const wss = new WebSocketServer({ noServer: true });

  // Bind to the existing HTTP server on the /yjs/ path
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    if (!url.pathname.startsWith('/yjs')) return;

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      hocuspocus!.handleConnection(ws, request as any);
    });
  });

  console.log('[Hocuspocus] Collaboration server initialized on /yjs*');

  return hocuspocus;
}

/** Graceful shutdown */
export async function destroyHocuspocus(): Promise<void> {
  if (hocuspocus) {
    await hocuspocus.closeConnections();
    hocuspocus = null;
  }
}
