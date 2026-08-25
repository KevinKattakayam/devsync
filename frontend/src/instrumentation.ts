export async function register(): Promise<void> {
  // Server-side Next.js spans are exported by the platform's OTEL runtime.
  // Browser API boundaries propagate trace_id in src/lib/api.ts.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
