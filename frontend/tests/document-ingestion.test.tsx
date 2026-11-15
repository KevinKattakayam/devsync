import { afterEach, expect, it } from 'vitest';
import api, { documentApi, setTokenGetter } from '../src/lib/api';
const previousAdapter = api.defaults.adapter;
const previousBase = api.defaults.baseURL;
afterEach(() => {
  api.defaults.adapter = previousAdapter;
  api.defaults.baseURL = previousBase;
  setTokenGetter(null);
});
it('uploads through the configured authenticated API origin and preserves multipart boundaries', async () => {
  api.defaults.baseURL = 'https://isolated-api.invalid/api/v1';
  setTokenGetter(async () => 'fixture-only-token');
  let called = false;
  api.defaults.adapter = async (config) => {
    called = true;
    expect(config.baseURL).toBe('https://isolated-api.invalid/api/v1');
    expect(config.url).toBe('/workspaces/workspace%2Fid/documents/ingest');
    expect(config.headers.Authorization).toBe('Bearer fixture-only-token');
    expect(config.data).toBeInstanceOf(FormData);
    expect(config.headers.getContentType()).not.toBe('application/json');
    return {
      data: { documentId: 'fixture-document' },
      status: 201,
      statusText: 'Created',
      headers: {},
      config,
    };
  };
  const upload = Reflect.get(documentApi, 'ingest') as
    ((workspace: string, file: File) => Promise<{ data: { documentId: string } }>) | undefined;
  expect(upload).toBeTypeOf('function');
  expect(
    (
      await upload!(
        'workspace/id',
        new File(['synthetic text'], 'sample.txt', { type: 'text/plain' }),
      )
    ).data.documentId,
  ).toBe('fixture-document');
  expect(called).toBe(true);
});
