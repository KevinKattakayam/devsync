"use client";

import Link from "next/link";
import { Zap, Check, ArrowLeft, Sparkles, Shield, Cpu, Users } from "lucide-react";

export default function BillingPage() {
  const tiers = [
    {
      name: "Developer",
      price: "$0",
      description: "Ideal for individual developers building side projects.",
      current: false,
      features: [
        "Up to 3 Workspaces",
        "Unlimited Documents & Kanban Boards",
        "Real-Time Collaboration & Cursors",
        "100k AI Tokens / month",
        "Community Support",
      ],
    },
    {
      name: "Enterprise Pro",
      price: "$29",
      period: "/month",
      badge: "ACTIVE PLAN",
      description: "Complete multiplayer development environment with unlimited AI features.",
      current: true,
      features: [
        "Unlimited Workspaces & Team Members",
        "True CRDT Multiplayer Collaboration (Yjs + Hocuspocus)",
        "Intelligent Document Ingestion (OCR PDF & Images)",
        "Multi-Agent BullMQ Automation (Task & PR Summaries)",
        "Real-time Redis Pub/Sub Horizontal Scaling",
        "Enterprise RBAC & Secret Encryption",
        "10,000,000 AI Tokens / month",
        "Priority 24/7 Support",
      ],
    },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="p-2 rounded-xl glass hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
            Subscription & Billing
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your workspace plan, usage quotas, and billing settings.
          </p>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`glass-card p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${
              tier.current
                ? "border-primary/50 shadow-2xl shadow-primary/10 glow-sm"
                : "border-white/10"
            }`}
          >
            {tier.badge && (
              <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/40 text-[10px] font-extrabold tracking-wider">
                {tier.badge}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center text-white">
                  <Zap className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-bold text-foreground">{tier.name}</h2>
              </div>

              <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-extrabold text-foreground">{tier.price}</span>
                {tier.period && (
                  <span className="text-xs text-muted-foreground">{tier.period}</span>
                )}
              </div>

              <div className="space-y-2.5 pt-4 border-t border-white/10 mb-6">
                {tier.features.map((feat) => (
                  <div key={feat} className="flex items-start gap-2.5 text-xs text-slate-300">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              disabled={tier.current}
              className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                tier.current
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default"
                  : "gradient-primary text-white hover:opacity-90 shadow-lg shadow-primary/20"
              }`}
            >
              {tier.current ? "Active Enterprise Plan" : "Downgrade Plan"}
            </button>
          </div>
        ))}
      </div>

      {/* Usage Meter Stats */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold mb-4 text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Workspace Resource Usage
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] text-muted-foreground mb-1">AI Tokens Used</p>
            <p className="text-lg font-bold text-foreground">Unlimited (Dev Tier)</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] text-muted-foreground mb-1">OCR Document Ingestion</p>
            <p className="text-lg font-bold text-emerald-400">Enabled</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] text-muted-foreground mb-1">Real-Time CRDT Nodes</p>
            <p className="text-lg font-bold text-indigo-400">Connected</p>
          </div>
        </div>
      </div>
    </div>
  );
}
