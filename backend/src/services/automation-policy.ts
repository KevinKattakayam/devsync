import { z } from 'zod';

/** Planning only. This module does not authorize, enqueue, persist or execute actions. */
export const automationRule = z
  .object({
    enabled: z.boolean(),
    trigger: z.enum(['task_review', 'blocker', 'pr_merged', 'ci_passed']),
    action: z.enum(['notify', 'escalate', 'prepare_report', 'update_linked_status']),
    debounceSeconds: z.number().int().min(1).max(86400),
  })
  .strict();

export const automationEvent = z
  .object({
    id: z.string().trim().min(1).max(191),
    trigger: automationRule.shape.trigger,
    depth: z.number().int().min(0).max(3),
  })
  .strict();

export function previewAutomation(rawRule: unknown, rawEvent: unknown) {
  const rule = automationRule.parse(rawRule);
  const event = automationEvent.parse(rawEvent);
  return {
    eligible: rule.enabled && rule.trigger === event.trigger && event.depth < 3,
    requiresApproval: true as const,
    action: rule.action,
  };
}
