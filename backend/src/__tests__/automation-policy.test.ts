import { previewAutomation } from '../services/automation-policy';

it('requires opt-in and explicit approval, and bounds event chains', () => {
  const rule = {
    enabled: true,
    trigger: 'task_review',
    action: 'notify',
    debounceSeconds: 30,
  } as const;
  const event = { id: 'event-1', trigger: 'task_review', depth: 0 } as const;
  expect(previewAutomation(rule, event)).toEqual({
    eligible: true,
    requiresApproval: true,
    action: 'notify',
  });
  expect(previewAutomation({ ...rule, enabled: false }, event).eligible).toBe(false);
  expect(previewAutomation(rule, { ...event, depth: 3 }).eligible).toBe(false);
  expect(previewAutomation(rule, { ...event, trigger: 'pr_merged' }).eligible).toBe(false);
});

it('rejects executable and unrecognized payload fields', () => {
  expect(() =>
    previewAutomation(
      {
        enabled: true,
        trigger: 'task_review',
        action: 'notify',
        debounceSeconds: 30,
        url: 'https://example.invalid',
      },
      { id: '1', trigger: 'task_review', depth: 0 },
    ),
  ).toThrow();
});
