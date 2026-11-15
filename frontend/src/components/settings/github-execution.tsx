'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import api, { githubRepositoryApi } from '@/lib/api';
import { Button } from '@/components/ui';
const repositories = z.array(z.object({ id: z.string(), owner: z.string(), name: z.string() }));
const evidence = z.object({
  items: z.array(
    z.object({
      kind: z.enum(['pull_request', 'check_run', 'review']),
      subject: z.string(),
      state: z.string(),
      conclusion: z.string().nullable(),
      headSha: z.string().nullable(),
      pullNumber: z.number().int().positive().nullable().default(null),
      providerAt: z.string().datetime(),
      observedAt: z.string().datetime(),
    }),
  ),
  liveAccess: z.enum(['not_verified', 'disconnected']),
  deployment: z.literal('unknown'),
});
export function GitHubExecution({ workspaceId }: { workspaceId: string }) {
  const [repos, setRepos] = useState<z.infer<typeof repositories>>([]),
    [selected, setSelected] = useState('');
  const [result, setResult] = useState<z.infer<typeof evidence>>(),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    void githubRepositoryApi
      .list(workspaceId)
      .then((r) => {
        if (!disposed) setRepos(repositories.parse(r.data));
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [workspaceId, attempt]);
  useEffect(() => {
    if (!selected) return;
    let disposed = false;
    const base = (api.defaults.baseURL || '/api/v1').replace(/\/api(?:\/v1)?\/?$/, '/api/v2');
    void api
      .get(
        `/workspaces/${encodeURIComponent(workspaceId)}/github-repositories/${encodeURIComponent(selected)}/execution`,
        { baseURL: base },
      )
      .then((r) => {
        if (!disposed) setResult(evidence.parse(r.data));
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [workspaceId, selected, attempt]);
  const repo = repos.find((r) => r.id === selected);
  return (
    <section className="space-y-4 rounded-xl border p-4" aria-label="GitHub execution evidence">
      <h2 className="text-lg font-semibold">GitHub PR & CI evidence</h2>
      <p className="text-sm text-muted-foreground">
        Live GitHub access is not verified. Individual review events are not an overall approval
        decision. Recorded webhook evidence does not establish current installation access or
        deployment.
      </p>
      <label className="block">
        Repository
        <select
          aria-label="Repository"
          className="mt-2 block w-full rounded-lg border bg-background p-2"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setResult(undefined);
            setFailed(false);
          }}
        >
          <option value="">Select a configured repository</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.owner}/{r.name}
            </option>
          ))}
        </select>
      </label>
      {failed && (
        <p role="alert">
          Repository evidence is unavailable. Check current access and configuration.
        </p>
      )}
      {result?.liveAccess === 'disconnected' && (
        <p role="status">
          GitHub app disconnected. Installation access withdrawal was recorded; reconnect requires
          operator verification.
        </p>
      )}
      {result && (
        <>
          <p>Deployment: unknown — no verified deployment evidence.</p>
          {result.items.length === 0 ? (
            <p>
              {result.liveAccess === 'disconnected'
                ? 'Recorded evidence is hidden while the repository is disconnected.'
                : 'No versioned PR or check evidence recorded.'}
            </p>
          ) : (
            <ul className="space-y-4">
              {result.items.map((item) => (
                <li key={`${item.kind}:${item.subject}`} className="rounded-lg border p-3">
                  <p>
                    {item.kind === 'pull_request' && repo ? (
                      <a
                        className="underline"
                        rel="noopener noreferrer"
                        target="_blank"
                        href={`https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pull/${encodeURIComponent(item.subject)}`}
                      >
                        PR #{item.subject}
                      </a>
                    ) : (
                      `${item.kind === 'review' ? 'Review' : 'Check'} #${item.subject}`
                    )}
                    : {item.state}
                    {item.conclusion ? ` · ${item.conclusion}` : ''}
                  </p>
                  {item.kind === 'review' && repo && item.pullNumber && (
                    <a
                      className="underline"
                      rel="noopener noreferrer"
                      target="_blank"
                      href={`https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pull/${item.pullNumber}#pullrequestreview-${encodeURIComponent(item.subject)}`}
                    >
                      Open PR #{item.pullNumber} review
                    </a>
                  )}
                  <p>
                    Provider time: <time dateTime={item.providerAt}>{item.providerAt}</time>
                  </p>
                  <p>
                    Received: <time dateTime={item.observedAt}>{item.observedAt}</time>
                  </p>
                  {item.headSha && (
                    <p className="break-all text-sm text-muted-foreground">
                      Commit: {item.headSha}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Button
        variant="secondary"
        onClick={() => {
          setFailed(false);
          setResult(undefined);
          setAttempt((a) => a + 1);
        }}
      >
        Refresh GitHub evidence
      </Button>
    </section>
  );
}
