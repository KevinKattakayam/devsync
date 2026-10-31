let draining = false;
export function isDraining() { return draining; }
export function beginDrain() { draining = true; }

export interface ShutdownResources {
  stopAccepting(): Promise<void>;
  collaboration(): Promise<void>;
  sockets(): Promise<void>;
  redis(): Promise<void>;
  database(): Promise<void>;
  telemetry(): Promise<void>;
  force(): void;
}
/** Reentrant caller can share this promise; always attempt dependency cleanup. */
export async function drainResources(resources: ShutdownResources, timeoutMs = 15000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    const errors: unknown[] = [];
    const httpClosed = resources.stopAccepting().catch(error => { errors.push(error); });
    for (const close of [resources.collaboration, resources.sockets, () => httpClosed, resources.redis, resources.database, resources.telemetry]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new Error('One or more resources failed to drain');
  };
  try {
    await Promise.race([run(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { resources.force(); reject(new Error('Shutdown deadline exceeded')); }, timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
