"use client";

import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Code2,
  FileText,
  GitPullRequest,
  Kanban,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

/* ──────────────────────────────────────────────────
   Feature cards data
   ────────────────────────────────────────────────── */
const features = [
  {
    icon: FileText,
    title: "Docs that move with the work",
    text: "Collaborative specs, decisions, and technical notes with live cursors and offline-safe sync.",
    accent: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: Kanban,
    title: "Delivery in one clear view",
    text: "Prioritized work, review flow, and GitHub-powered task movement without status-chasing.",
    accent: "bg-violet-50 text-violet-600",
  },
  {
    icon: Sparkles,
    title: "AI with your team's context",
    text: "Semantic workspace retrieval and visible source citations make answers useful and explainable.",
    accent: "bg-amber-50 text-amber-600",
  },
  {
    icon: ShieldCheck,
    title: "Ready for real teams",
    text: "SSO-ready identity, role-based access, tenant isolation, and signed webhook automation.",
    accent: "bg-emerald-50 text-emerald-600",
  },
];

/* ──────────────────────────────────────────────────
   Trust / security line items
   ────────────────────────────────────────────────── */
const securityItems = [
  {
    icon: LockKeyhole,
    title: "Identity that fits your organization",
    text: "Google, GitHub, enterprise SSO, and durable workspace roles.",
  },
  {
    icon: Users,
    title: "Privacy by workspace",
    text: "Every search, AI retrieval, document, and workflow action is tenant-scoped.",
  },
  {
    icon: ShieldCheck,
    title: "Automation you can trust",
    text: "Signed GitHub webhook delivery and idempotent workflow transitions.",
  },
];

/* ──────────────────────────────────────────────────
   Landing Page Component
   ────────────────────────────────────────────────── */
export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/dashboard" : "/signup";
  const primaryLabel = isAuthenticated ? "Open workspace" : "Start for free";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAFAFA] text-zinc-900 selection:bg-indigo-200/60">

      {/* ── Atmospheric mesh gradient ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-10%] h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-100/60 blur-[140px]" />
        <div className="absolute right-[10%] top-[5%] h-[600px] w-[600px] rounded-full bg-violet-100/40 blur-[120px]" />
        <div className="absolute left-[15%] top-[12%] h-[500px] w-[500px] rounded-full bg-slate-200/50 blur-[100px]" />
      </div>

      {/* ── Subtle dot grid pattern ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, #d4d4d8 0.8px, transparent 0.8px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ════════════════════════════════════════════
          NAVIGATION — Frosted Glass
          ════════════════════════════════════════════ */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200/60 bg-white/60 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-zinc-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 shadow-sm">
              <Zap className="h-4 w-4 fill-white text-white" />
            </span>
            DevSync
          </Link>

          {/* Nav links */}
          <div className="hidden items-center gap-8 text-[13px] font-medium text-zinc-500 md:flex">
            <a href="#platform" className="transition hover:text-zinc-900">Platform</a>
            <a href="#security" className="transition hover:text-zinc-900">Security</a>
            <a href="#workflow" className="transition hover:text-zinc-900">Workflow</a>
          </div>

          {/* Auth */}
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="hidden font-medium text-zinc-600 transition hover:text-zinc-900 sm:block"
            >
              Log in
            </Link>
            <Link
              href={primaryHref}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════
          HERO SECTION
          ════════════════════════════════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-8 pt-32 text-center lg:px-8 lg:pt-40">

        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-zinc-200 bg-white/80 px-4 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            ⚡ Local-first. Enterprise ready.
          </span>
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-[clamp(2.5rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-zinc-900">
          The collaboration engine{" "}
          <span className="text-zinc-400">for high-velocity teams.</span>
        </h1>

        {/* Sub-headline */}
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-zinc-500">
          Unify your Kanban, architecture docs, and code snippets in a single,
          lightning-fast workspace.{" "}
          <span className="font-medium text-zinc-700">Zero context switching. Infinite scale.</span>
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href={primaryHref}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-zinc-900/10 transition hover:bg-zinc-800 hover:shadow-xl hover:shadow-zinc-900/15"
          >
            {primaryLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#platform"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-3.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:border-zinc-300"
          >
            Explore platform
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        {/* Trust markers */}
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            No credit card required
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            SSO &amp; SCIM enabled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            End-to-End Encrypted
          </span>
        </div>

        {/* ── Product Mockup — Floating Glassmorphic ── */}
        <div className="mx-auto mt-20 max-w-6xl">
          <div className="rounded-2xl border border-zinc-200/80 bg-white/60 p-2.5 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.08)] backdrop-blur-2xl">
            <div className="overflow-hidden rounded-xl border border-zinc-200/60 bg-white text-left shadow-sm">

              {/* Mockup title bar */}
              <div className="flex h-11 items-center gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4">
                <div className="flex gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <i className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="mx-auto flex items-center gap-2 rounded-md border border-zinc-200/80 bg-white px-3 py-1 text-[11px] text-zinc-400">
                  <Search className="h-3 w-3" />
                  Search DevSync
                </div>
              </div>

              {/* Mockup body */}
              <div className="grid min-h-[360px] grid-cols-1 md:grid-cols-[190px_1fr_230px]">

                {/* Sidebar */}
                <aside className="hidden border-r border-zinc-100 bg-zinc-50/50 p-4 md:block">
                  <div className="mb-7 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <span className="grid h-6 w-6 place-items-center rounded bg-zinc-900 text-white">
                      <Zap className="h-3 w-3 fill-white" />
                    </span>
                    Atlas Engineering
                  </div>
                  {(
                    [
                      [FileText, "Docs"],
                      [Kanban, "Delivery"],
                      [Code2, "Snippets"],
                      [GitPullRequest, "Integrations"],
                    ] as const
                  ).map(([Icon, label]) => (
                    <div
                      key={label}
                      className={`mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium transition ${
                        label === "Delivery"
                          ? "bg-zinc-900 text-white shadow-sm"
                          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </div>
                  ))}
                </aside>

                {/* Main content area */}
                <section className="p-5 sm:p-7">
                  <div className="mb-6 flex items-start justify-between">
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        Q3 launch
                      </p>
                      <h2 className="mt-1.5 text-xl font-bold text-zinc-900">
                        Release command center
                      </h2>
                      <p className="mt-1 text-xs text-zinc-400">
                        12 active tasks · synced 2 minutes ago
                      </p>
                    </div>
                    <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800">
                      New task
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["Backlog", "3", "bg-zinc-100 text-zinc-600"],
                        ["In review", "4", "bg-amber-50 text-amber-600"],
                        ["Ready to ship", "5", "bg-emerald-50 text-emerald-600"],
                      ] as const
                    ).map(([name, count, badge]) => (
                      <div
                        key={name}
                        className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3"
                      >
                        <div className="mb-4 flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-500">{name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge}`}>
                            {count}
                          </span>
                        </div>
                        {[1, 2].map((n) => (
                          <div
                            key={n}
                            className="mb-2 rounded-lg border border-zinc-100 bg-white p-2.5 shadow-sm"
                          >
                            <div className="h-1.5 w-4/5 rounded-full bg-zinc-200" />
                            <div className="mt-2 h-1.5 w-2/5 rounded-full bg-zinc-100" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>

                {/* AI Sidebar */}
                <aside className="hidden border-l border-zinc-100 bg-zinc-50/50 p-4 lg:block">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-800">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    Workspace AI
                  </div>
                  <p className="mt-4 text-xs leading-5 text-zinc-500">
                    &quot;The release plan has 2 open API dependencies and 4 tasks
                    ready for review.&quot;
                  </p>
                  <div className="mt-5 border-t border-zinc-100 pt-3">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      Sources
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-indigo-600">
                      API v2 design doc
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-indigo-600">
                      DEV-184 · OAuth callback
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          PLATFORM FEATURES
          ════════════════════════════════════════════ */}
      <section id="platform" className="relative z-10 px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-xl">
            <p
              className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-600"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              One connected platform
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Everything your team needs to turn decisions into delivery.
            </h2>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {features.map(({ icon: Icon, title, text, accent }) => (
              <article
                key={title}
                className="group rounded-2xl border border-zinc-200/80 bg-white/70 p-7 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              >
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-zinc-900">
                  {title}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          SECURITY / TRUST
          ════════════════════════════════════════════ */}
      <section id="security" className="relative z-10 px-6 py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1fr_.85fr] lg:items-center">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-600"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Built to earn trust
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Keep collaboration fast without compromising control.
            </h2>
            <div className="mt-10 space-y-6">
              {securityItems.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Health dashboard card */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white/60 p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)] backdrop-blur-2xl">
            <div className="rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Workspace health
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {(
                  [
                    ["SSO", "Connected"],
                    ["Collaboration", "Live"],
                    ["AI context", "Scoped"],
                    ["Webhooks", "Verified"],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5"
                  >
                    <p className="text-[11px] font-medium text-zinc-400">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-600">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          BOTTOM CTA
          ════════════════════════════════════════════ */}
      <section id="workflow" className="relative z-10 px-6 pb-28 lg:px-8">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/70 px-7 py-16 text-center shadow-[0_30px_80px_-15px_rgba(0,0,0,0.06)] backdrop-blur-2xl sm:px-14">
          {/* Subtle background glow inside CTA */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
            <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-50/80 blur-[100px]" />
          </div>

          <div className="relative">
            <p
              className="text-xs font-semibold uppercase tracking-[0.1em] text-indigo-600"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Build your team&apos;s source of momentum
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Make your next release the calmest one yet.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-500">
              Start with a workspace. Bring in your team. Let DevSync keep the
              context connected.
            </p>
            <Link
              href={primaryHref}
              className="mt-9 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-zinc-900/10 transition hover:bg-zinc-800 hover:shadow-xl hover:shadow-zinc-900/15"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-zinc-200/60 px-6 py-7 text-xs text-zinc-400">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 font-medium text-zinc-600">
            <Zap className="h-3.5 w-3.5 text-zinc-400" /> DevSync
          </span>
          <span>
            © {new Date().getFullYear()} DevSync. Built for teams that ship.
          </span>
        </div>
      </footer>
    </main>
  );
}
