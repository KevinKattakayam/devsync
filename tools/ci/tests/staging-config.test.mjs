import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStagingConfiguration } from '../staging-configuration.mjs';

const valid = {
  REVIEWED_SHA: 'a'.repeat(40),
  STAGING_RAILWAY_PROJECT_ID: 'stage-project',
  STAGING_RAILWAY_ENVIRONMENT_ID: 'stage-environment',
  STAGING_RAILWAY_API_SERVICE_ID: 'stage-api',
  STAGING_RAILWAY_WORKER_SERVICE_ID: 'stage-worker',
  PRODUCTION_RAILWAY_PROJECT_ID: 'prod-project',
  PRODUCTION_RAILWAY_ENVIRONMENT_ID: 'prod-environment',
  PRODUCTION_RAILWAY_API_SERVICE_ID: 'prod-api',
  PRODUCTION_RAILWAY_WORKER_SERVICE_ID: 'prod-worker',
  STAGING_VERCEL_PROJECT_ID: 'stage-vercel',
  PRODUCTION_VERCEL_PROJECT_ID: 'prod-vercel',
  STAGING_API_ORIGIN: 'https://api.staging.invalid',
  STAGING_FRONTEND_ORIGIN: 'https://app.staging.invalid',
  STAGING_RAILWAY_TOKEN: 'fixture-token',
  STAGING_VERCEL_TOKEN: 'fixture-token',
};
test('accepts explicit distinct staging targets and a reviewed SHA', () => {
  assert.doesNotThrow(() => validateStagingConfiguration(valid));
});
test('rejects missing credentials and malformed reviewed SHA without exposing values', () => {
  for (const key of ['STAGING_RAILWAY_TOKEN', 'STAGING_VERCEL_TOKEN']) {
    assert.throws(
      () => validateStagingConfiguration({ ...valid, [key]: '' }),
      /Invalid staging configuration/,
    );
  }
  assert.throws(
    () => validateStagingConfiguration({ ...valid, REVIEWED_SHA: 'bad' }),
    /Invalid staging configuration/,
  );
  for (const key of Object.keys(valid)) {
    assert.throws(
      () => validateStagingConfiguration({ ...valid, [key]: '' }),
      /Invalid staging configuration/,
    );
  }
});
test('rejects production target reuse and unsafe or credential-bearing origins', () => {
  for (const [stage, production] of [
    ['STAGING_RAILWAY_PROJECT_ID', 'PRODUCTION_RAILWAY_PROJECT_ID'],
    ['STAGING_RAILWAY_ENVIRONMENT_ID', 'PRODUCTION_RAILWAY_ENVIRONMENT_ID'],
    ['STAGING_VERCEL_PROJECT_ID', 'PRODUCTION_VERCEL_PROJECT_ID'],
    ['STAGING_RAILWAY_API_SERVICE_ID', 'PRODUCTION_RAILWAY_API_SERVICE_ID'],
    ['STAGING_RAILWAY_WORKER_SERVICE_ID', 'PRODUCTION_RAILWAY_WORKER_SERVICE_ID'],
  ])
    assert.throws(
      () => validateStagingConfiguration({ ...valid, [stage]: valid[production] }),
      /Invalid staging configuration/,
    );
  for (const origin of [
    'http://example.invalid',
    'https://user:secret@example.invalid',
    'https://example.invalid/path',
  ])
    assert.throws(
      () => validateStagingConfiguration({ ...valid, STAGING_API_ORIGIN: origin }),
      /Invalid staging configuration/,
    );
  assert.throws(
    () =>
      validateStagingConfiguration({
        ...valid,
        STAGING_RAILWAY_API_SERVICE_ID: valid.PRODUCTION_RAILWAY_WORKER_SERVICE_ID,
      }),
    /Invalid staging configuration/,
  );
  assert.throws(
    () =>
      validateStagingConfiguration({
        ...valid,
        STAGING_RAILWAY_API_SERVICE_ID: valid.STAGING_RAILWAY_WORKER_SERVICE_ID,
      }),
    /Invalid staging configuration/,
  );
});
