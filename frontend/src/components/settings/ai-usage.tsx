'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button, Skeleton } from '@/components/ui';
interface Usage {
  unit: string;
  period: string;
  resets?: { daily: string; monthly: string };
  concurrency?: { userLimit: number; workspaceLimit: number };
  user: { daily: number; monthly: number; dailyLimit: number; monthlyLimit: number };
  workspace: { daily: number; monthly: number; dailyLimit: number; monthlyLimit: number };
}
export function AiUsage({ workspaceId }: { workspaceId: string }) {
  return <ScopedAiUsage key={workspaceId} workspaceId={workspaceId} />;
}
function ScopedAiUsage({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<Usage>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void api
      .get<Usage>(
        `${(api.defaults?.baseURL || '/api').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v3/ai/usage`,
        { params: { workspaceId } },
      )
      .then((r) => {
        if (active) {
          setData(r.data);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, attempt]);
  return (
    <section aria-label="AI usage" className="my-8 space-y-3">
      <h2 className="text-lg font-semibold">AI usage</h2>
      <p className="text-sm text-muted-foreground">
        Reserved requests, including ambiguous failures and partial output. Confirmed pre-provider
        failures are refunded. UTC day/month; this is not token billing. Your allowance is shared
        across your workspaces.
      </p>
      {error ? (
        <p role="alert">Usage unavailable.</p>
      ) : data ? (
        <dl className="text-sm space-y-2 break-words">
          <dt>Your daily / monthly requests</dt>
          <dd>
            {data.user.daily} / {data.user.dailyLimit} today · {data.user.monthly} /{' '}
            {data.user.monthlyLimit} this month
          </dd>
          <dt>This workspace daily / monthly requests</dt>
          <dd>
            {data.workspace.daily} / {data.workspace.dailyLimit} today · {data.workspace.monthly} /{' '}
            {data.workspace.monthlyLimit} this month
          </dd>
          {data.resets && (
            <>
              <dt>Daily reset / monthly reset (UTC)</dt>
              <dd>
                {data.resets.daily} / {data.resets.monthly}
              </dd>
            </>
          )}
          {data.concurrency && (
            <>
              <dt>Concurrent request limits</dt>
              <dd>
                {data.concurrency.userLimit} for you · {data.concurrency.workspaceLimit} for this
                workspace
              </dd>
            </>
          )}
        </dl>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}
      <Button variant="secondary" onClick={() => setAttempt((v) => v + 1)}>
        Refresh AI usage
      </Button>
    </section>
  );
}
