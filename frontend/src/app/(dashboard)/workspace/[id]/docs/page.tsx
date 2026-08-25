"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { documentApi } from "@/lib/api";
import { Document } from "@/types";
import { formatRelativeTime, getInitials, generateColor } from "@/lib/utils";
import {
  FileText, Plus, Loader2, ChevronRight, Search, Trash2,
  Upload, Sparkles, BookOpen, Layers, ShieldAlert, Cpu, FileUp
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

const TEMPLATES = [
  {
    icon: "🏗️",
    title: "Architecture Decision Record",
    description: "Document context, options, and decisions for technical choices.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "ADR: Architecture Decision Record" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "1. Context & Problem Statement" }] },
        { type: "paragraph", content: [{ type: "text", text: "Describe the context and background that motivates this technical decision." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "2. Considered Options" }] },
        { type: "bulletList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Option A: (Description and trade-offs)" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Option B: (Description and trade-offs)" }] }] },
        ]},
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "3. Decision Outcome" }] },
        { type: "paragraph", content: [{ type: "text", text: "Chosen option and rationale for the decision." }] },
      ],
    },
  },
  {
    icon: "🚀",
    title: "Sprint Feature Specification",
    description: "Define user stories, technical tasks, and acceptance criteria.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Feature Spec: [Feature Name]" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "User Story" }] },
        { type: "paragraph", content: [{ type: "text", text: "As a [user role], I want to [action] so that [business value]." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Acceptance Criteria" }] },
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Real-time sync verified across multiple tabs" }] }] },
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Unit and integration test suites passing" }] }] },
        ]},
      ],
    },
  },
  {
    icon: "🔌",
    title: "API Design & Integration Spec",
    description: "Endpoints, request payloads, response codes, and rate limits.",
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "API Specification: [Service Name]" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "POST /api/v1/resource" }] },
        { type: "paragraph", content: [{ type: "text", text: "Authentication: Bearer JWT" }] },
        { type: "codeBlock", attrs: { language: "json" }, content: [{ type: "text", text: '{\n  "name": "example",\n  "enabled": true\n}' }] },
      ],
    },
  },
];

export default function DocsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (id) loadDocs(); }, [id]);

  const loadDocs = async () => {
    try {
      const { data } = await documentApi.list(id);
      setDocs(data);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  };

  const createDoc = async () => {
    try {
      const { data } = await documentApi.create(id);
      router.push(`/workspace/${id}/docs/${data.id}`);
    } catch {
      toast.error("Failed to create document");
    }
  };

  const createFromTemplate = async (template: typeof TEMPLATES[0]) => {
    try {
      const { data } = await documentApi.create(id, {
        title: `${template.icon} ${template.title}`,
      });
      toast.success(`Created "${template.title}"`);
      router.push(`/workspace/${id}/docs/${data.id}`);
    } catch {
      toast.error("Failed to create template document");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    setShowUploadModal(false);
    const toastId = toast.loading(`Ingesting "${file.name}" with OCR AI...`);

    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:5000/api/workspaces/${id}/documents/ingest`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "OCR Document ingestion failed");
      }

      const result = await res.json();
      toast.success("Document ingested and converted to rich text!", { id: toastId });
      loadDocs();
      const docId = result.documentId || result.id;
      if (docId) {
        router.push(`/workspace/${id}/docs/${docId}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process document", { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteDoc = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await documentApi.delete(docId);
      loadDocs();
      toast.success("Document archived");
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const filtered = docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading documentation hub...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-6 border-white/10 relative overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
            Documentation Hub
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time multiplayer CRDT markdown with intelligent OCR ingestion & AI synthesis.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-foreground text-xs font-semibold transition-all hover:border-primary/40"
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-primary" />}
            Import PDF / OCR Scan
          </button>
          <button
            onClick={createDoc}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" /> New Document
          </button>
        </div>
      </div>

      {/* Quick Template Gallery */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Starter Templates
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.title}
              onClick={() => createFromTemplate(tmpl)}
              className="glass-card-hover p-4 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="text-2xl mb-2">{tmpl.icon}</div>
                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {tmpl.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {tmpl.description}
                </p>
              </div>
              <span className="text-[10px] font-semibold text-primary mt-3 flex items-center gap-1">
                Use template <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Search & List */}
      <div>
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by title, author or tag..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs focus:border-primary outline-none transition-all"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold mb-1">{search ? "No documents match search" : "No documents yet"}</h3>
            <p className="text-xs text-muted-foreground mb-4">Start writing or import an existing PDF specification.</p>
            <button onClick={createDoc} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold">
              <Plus className="w-4 h-4" /> Create Document
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                onClick={() => router.push(`/workspace/${id}/docs/${doc.id}`)}
                className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all group relative overflow-hidden"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-xl shadow-sm">
                  {doc.icon || "📄"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {doc.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold"
                        style={{ backgroundColor: generateColor(doc.author?.name || "") }}
                      >
                        {getInitials(doc.author?.name || "?")}
                      </div>
                      {doc.author?.name || "Author"}
                    </span>
                    <span>Updated {formatRelativeTime(doc.updatedAt)}</span>
                    {doc.title.includes("AI Agent") && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-bold">
                        AUTOMATED AGENT
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteDoc(doc.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-all"
                  title="Archive Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

