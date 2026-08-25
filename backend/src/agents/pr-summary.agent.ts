import { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { createWorker, QueueNames } from '../lib/queue';
import Groq from 'groq-sdk';

interface PRSummaryJobData {
  action: 'opened' | 'merged';
  prTitle: string;
  prBody: string;
  prNumber: number;
  prUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  workspaceId: string;
  taskKeys: string[];
  author: string;
}

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

/**
 * Agent: PR Summary Generator
 *
 * Triggered by GitHub webhook when a PR is opened or merged.
 * 1. Generates a technical summary of the PR via Groq AI
 * 2. Creates Activity records for the workspace audit log
 * 3. Links the summary to related tasks via task keys
 */
async function processPRSummary(job: Job<PRSummaryJobData>): Promise<void> {
  const {
    action, prTitle, prBody, prNumber, prUrl,
    repositoryOwner, repositoryName,
    workspaceId, taskKeys, author,
  } = job.data;

  const repoFullName = `${repositoryOwner}/${repositoryName}`;
  const actionVerb = action === 'merged' ? 'merged' : 'opened';

  // Generate summary via Groq
  let summary = `PR #${prNumber} "${prTitle}" was ${actionVerb} by ${author} in ${repoFullName}.`;

  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: 'You are a concise technical summarizer for a developer workspace. Generate a 2-3 sentence summary of a GitHub pull request. Focus on what changed and its impact. Be factual.',
          },
          {
            role: 'user',
            content: `Summarize this ${actionVerb} PR:\n\nRepository: ${repoFullName}\nPR #${prNumber}: ${prTitle}\nAuthor: ${author}\nBody:\n${(prBody || 'No description').slice(0, 2000)}\n\nReferenced tasks: ${taskKeys.join(', ') || 'None'}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      summary = completion.choices[0]?.message?.content || summary;
    } catch (error) {
      console.error('[Agent:PRSummary] Groq API error:', error);
    }
  }

  // Find a workspace member to attribute the activity to
  const ownerMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: 'OWNER' },
    select: { userId: true },
  });

  if (!ownerMember) {
    console.warn(`[Agent:PRSummary] No owner found for workspace ${workspaceId}, skipping activity`);
    return;
  }

  // Create activity record
  await prisma.activity.create({
    data: {
      type: `pr_${actionVerb}`,
      message: summary,
      metadata: {
        prNumber,
        prTitle,
        prUrl,
        repository: repoFullName,
        author,
        taskKeys,
        agent: 'pr-summary',
        automated: true,
      },
      userId: ownerMember.userId,
      workspaceId,
    },
  });

  console.log(`[Agent:PRSummary] Summarized PR #${prNumber} "${prTitle}" (${actionVerb})`);
}

export function startPRSummaryWorker() {
  return createWorker<PRSummaryJobData>(
    QueueNames.PR_SUMMARY,
    processPRSummary,
    2,
  );
}
