import { randomUUID } from 'crypto';
import {
  automationJob,
  automationJobId,
  processAutomationJob,
  automationQueueDeadline,
  dispatchAutomationWorkspace,
  startAutomationPolling,
} from '../services/automation-worker';
import { decryptSecret } from '../services/secret.service';

it('uses an opaque identifier and authenticated encryption for queue routing', () => {
  const previous = process.env.ENCRYPTION_KEY;
  try {
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    const id = randomUUID();
    const payload = automationJob('tenant-fixture-private-name', id);
    expect(JSON.stringify(payload)).not.toContain('tenant-fixture-private-name');
    expect(decryptSecret(payload.tenantEnvelope)).toBe('tenant-fixture-private-name');
    expect(automationJobId(id)).toBe(automationJobId(id));
    expect(automationJobId(id)).not.toContain(id);
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  }
});
it('bounds a stalled automation queue operation', async () => {
  await expect(automationQueueDeadline(new Promise<never>(() => {}), 25)).rejects.toThrow(
    'Automation queue unavailable',
  );
});
it('returns successful queue operations without waiting for the deadline', async () => {
  await expect(automationQueueDeadline(Promise.resolve('queued'), 100)).resolves.toBe('queued');
});
it('does not dispatch or poll when automation is disabled', async () => {
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'false';
    await expect(dispatchAutomationWorkspace('fixture-workspace')).resolves.toBeUndefined();
    await expect(startAutomationPolling(10).stop()).resolves.toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});
it('rejects invalid queue identifiers and tampered encrypted routing data', async () => {
  const previousFlag = process.env.FEATURE_AUTOMATION;
  const previousKey = process.env.ENCRYPTION_KEY;
  try {
    process.env.FEATURE_AUTOMATION = 'true';
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
    expect(() => automationJob('', randomUUID())).toThrow();
    expect(() => automationJobId('not-a-uuid')).toThrow();
    const payload = automationJob('fixture-workspace', randomUUID());
    const parts = payload.tenantEnvelope.split(':');
    parts[3] = `${parts[3].startsWith('A') ? 'B' : 'A'}${parts[3].slice(1)}`;
    await expect(
      processAutomationJob({ ...payload, tenantEnvelope: parts.join(':') }),
    ).rejects.toThrow();
  } finally {
    if (previousFlag === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previousFlag;
    if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previousKey;
  }
});
it('rejects plaintext or extra fields and performs no work while disabled', async () => {
  const previous = process.env.FEATURE_AUTOMATION;
  try {
    process.env.FEATURE_AUTOMATION = 'false';
    await expect(processAutomationJob({ arbitrary: 'fixture' })).resolves.toBeUndefined();
    process.env.FEATURE_AUTOMATION = 'true';
    await expect(
      processAutomationJob({
        executionId: randomUUID(),
        tenantEnvelope: 'plaintext-workspace',
        action: 'execute',
      }),
    ).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.FEATURE_AUTOMATION;
    else process.env.FEATURE_AUTOMATION = previous;
  }
});
