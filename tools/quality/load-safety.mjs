// Pure validation shared by the k6 setup and local unit tests.
export function validateLoadConfig(environment) {
  const base = environment.K6_BASE_URL || '';
  const match = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})\/api\/?$/.exec(base);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535)
    throw new Error('Fixture URL must be http://127.0.0.1:<port>/api');
  if (!/^[a-f0-9]{64}$/.test(environment.K6_FIXTURE_CAPABILITY || ''))
    throw new Error('A valid fixture capability is required');
  if (!environment.K6_ACCESS_TOKEN || environment.K6_ACCESS_TOKEN.length > 2048)
    throw new Error('A fixture access token is required');
  for (const key of ['K6_WORKSPACE_ID', 'K6_DOCUMENT_ID']) {
    if (!/^[A-Za-z0-9_-]{1,191}$/.test(environment[key] || ''))
      throw new Error('Valid fixture workspace and document IDs are required');
  }
  return { base: base.replace(/\/$/, ''), origin: base.replace(/\/api\/?$/, '') };
}

export function validateFixtureResponse(status, body, expectedRunId) {
  if (status !== 200) throw new Error('Fixture preflight rejected');
  let proof;
  try {
    proof = JSON.parse(body);
  } catch {
    throw new Error('Malformed fixture preflight response');
  }
  if (
    !proof ||
    typeof proof !== 'object' ||
    Array.isArray(proof) ||
    Object.keys(proof).sort().join(',') !== 'marker,runId' ||
    proof.marker !== 'devsync-isolated-fixture-v1' ||
    typeof proof.runId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(proof.runId) ||
    (expectedRunId && proof.runId !== expectedRunId)
  )
    throw new Error('Fixture preflight identity mismatch');
  return proof.runId;
}
