import { redirect } from 'next/navigation';

interface Metrics { activeWorkspaces: number; mrrCents: number; aiTokens: number; queueDepth: number; generatedAt: string; }

async function loadMetrics(): Promise<Metrics> {
  const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:5000'}/api/superadmin/metrics`, { headers: { 'x-superadmin-service-token': process.env.SUPERADMIN_SERVICE_TOKEN || '' }, cache: 'no-store' });
  if (!response.ok) redirect('/dashboard');
  return response.json() as Promise<Metrics>;
}

export default async function SuperadminDashboard(): Promise<React.JSX.Element> {
  const metrics = await loadMetrics();
  const cards = [['Active Workspaces', metrics.activeWorkspaces.toLocaleString()], ['MRR', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(metrics.mrrCents / 100)], ['AI Tokens This Month', metrics.aiTokens.toLocaleString()], ['Queue Depth', metrics.queueDepth.toLocaleString()]];
  return <section className="space-y-6"><div><p className="text-xs uppercase tracking-[0.2em] text-primary">Control Plane</p><h1 className="text-3xl font-bold">Superadmin observability</h1></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="glass-card border border-white/10 p-5 shadow-2xl"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>)}</div><p className="text-xs text-muted-foreground">Live Postgres, Stripe billing, and BullMQ telemetry · {metrics.generatedAt}</p></section>;
}
