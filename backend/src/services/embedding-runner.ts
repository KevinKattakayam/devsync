import { processEmbeddingJobs } from './embedding.service';
import { logger } from '../observability/logger';

/** Shared API/worker scheduler; stop cancels admission and awaits the in-flight batch. */
export function startEmbeddingPolling(
  intervalMs = 1000,
  run: () => Promise<void> = processEmbeddingJobs,
) {
  let stopped = false;
  let inFlight: Promise<void> | undefined;
  function tick() {
    if (stopped || inFlight) return;
    inFlight = Promise.resolve()
      .then(run)
      .catch(() => logger.error('Embedding batch failed'))
      .finally(() => {
        inFlight = undefined;
      });
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
