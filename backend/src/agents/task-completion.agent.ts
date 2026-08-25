import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createWorker, QueueNames } from '../lib/queue';
import { completeWithFallback } from '../services/ai-gateway.service';

interface TaskCompletionJobData {
  taskId: string;
  taskTitle: string;
  taskKey: string | null;
  columnName: string;
  workspaceId: string;
}

/**
 * Agent: Task Completion Summarizer
 *
 * Triggered when a Kanban task moves to a "Done" column.
 * 1. Fetches the task and any linked snippets/docs
 * 2. Generates a summary via Groq AI
 * 3. Creates an Activity record for the workspace audit log
 */
async function processTaskCompletion(job: Job<TaskCompletionJobData>): Promise<void> {
  const { taskId, taskTitle, taskKey, workspaceId } = job.data;

  // Fetch the full task with related data
  const task = await prisma.withTenantTransaction(workspaceId, (tx) => tx.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { name: true } },
      labels: true,
      column: { select: { name: true } },
    },
  }));

  if (!task) {
    console.warn(`[Agent:TaskCompletion] Task ${taskId} not found, skipping`);
    return;
  }

  // Find related snippets by searching for task key references
  let relatedContext = '';
  if (taskKey) {
    const snippets = await prisma.withTenantTransaction(workspaceId, (tx) => tx.snippet.findMany({
      where: {
        workspaceId,
        OR: [
          { title: { contains: taskKey, mode: 'insensitive' } },
          { description: { contains: taskKey, mode: 'insensitive' } },
        ],
      },
      take: 3,
      select: { title: true, language: true, description: true },
    }));

    if (snippets.length > 0) {
      relatedContext = '\n\nRelated snippets:\n' + snippets.map(
        (s) => `- ${s.title} (${s.language}): ${s.description || 'No description'}`
      ).join('\n');
    }
  }

  // Provider-neutral circuit breaker: Groq is primary and OpenAI is failover.
  let summary = `Task "${taskTitle}" completed.`;
  try {
    const completion = await completeWithFallback({
      system: 'You are a concise technical summarizer for a developer workspace. Generate a brief 2-3 sentence summary of a completed task. Be factual and developer-focused.',
      prompt: `Summarize this completed task:\n\nTitle: ${task.title}\nKey: ${taskKey || 'N/A'}\nDescription: ${task.description || 'No description'}\nAssignee: ${task.assignee?.name || 'Unassigned'}\nLabels: ${task.labels.map((l) => l.name).join(', ') || 'None'}\nColumn: ${task.column.name}${relatedContext}`,
    });
    summary = completion.content;
  } catch (error) { console.error('[Agent:TaskCompletion] AI gateway failed:', error); }

  const owner = await prisma.workspaceMember.findFirst({ where: { workspaceId, role: 'OWNER' }, select: { userId: true } });
  if (!owner) {
    console.warn(`[Agent:TaskCompletion] No owner found for workspace ${workspaceId}, skipping durable summary`);
    return;
  }

  // Durable, user-visible audit document. This is an append-only Tiptap JSON
  // projection; the local-first client subsequently syncs it into its Y.Doc.
  await prisma.withTenantTransaction(workspaceId, async (tx) => {
    const document = await tx.document.findFirst({ where: { workspaceId, title: 'AI Agent Summaries', isArchived: false }, select: { id: true, content: true } });
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: `Task: ${taskTitle}\n${summary}` }] };
    const existing = document?.content as { type?: string; content?: unknown[] } | null;
    const content = { type: 'doc', content: [...(Array.isArray(existing?.content) ? existing.content : []), paragraph] } as Prisma.InputJsonValue;
    if (document) await tx.document.update({ where: { id: document.id }, data: { content } });
    else await tx.document.create({ data: { title: 'AI Agent Summaries', content, authorId: owner.userId, workspaceId } });
  });

  await prisma.activity.create({
    data: {
      type: 'task_completed',
      message: summary,
      metadata: {
        taskId,
        taskKey,
        taskTitle,
        agent: 'task-completion',
        automated: true,
      },
      userId: task.assignee ? task.assigneeId! : owner.userId,
      workspaceId,
    },
  });

  console.log(`[Agent:TaskCompletion] Summarized task "${taskTitle}" (${taskKey || taskId})`);
}

export function startTaskCompletionWorker() {
  return createWorker<TaskCompletionJobData>(
    QueueNames.TASK_COMPLETION,
    processTaskCompletion,
    2,
  );
}
