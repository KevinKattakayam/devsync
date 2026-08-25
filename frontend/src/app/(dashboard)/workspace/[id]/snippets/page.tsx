"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { snippetApi, aiApi } from "@/lib/api";
import { Snippet } from "@/types";
import { formatRelativeTime, getInitials, generateColor } from "@/lib/utils";
import {
  Code2, Plus, Loader2, Search, Copy, Trash2, X, Check,
  Sparkles, Play, Terminal, HelpCircle, RefreshCw, Wand2
} from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = ['typescript', 'javascript', 'python', 'go', 'rust', 'sql', 'bash', 'html', 'css', 'json', 'yaml', 'docker'];

export default function SnippetsPage() {
  const { id } = useParams<{ id: string }>();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLang, setSelectedLang] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', code: '', language: 'typescript', description: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Execution & AI States
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runOutputs, setRunOutputs] = useState<Record<string, { output: string; timeMs: number }>>({});
  const [stdinInputs, setStdinInputs] = useState<Record<string, string>>({});
  const [activeStdinId, setActiveStdinId] = useState<string | null>(null);
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGenPrompt, setAiGenPrompt] = useState("");

  useEffect(() => { if (id) loadSnippets(); }, [id]);

  const loadSnippets = async () => {
    try {
      const { data } = await snippetApi.list(id);
      setSnippets(data);
    } catch {
      toast.error("Failed to load code snippets");
    } finally {
      setIsLoading(false);
    }
  };

  const createSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await snippetApi.create(id, form);
      setShowCreate(false);
      setForm({ title: '', code: '', language: 'typescript', description: '' });
      loadSnippets();
      toast.success("Code snippet saved successfully");
    } catch {
      toast.error("Failed to save code snippet");
    }
  };

  const generateSnippetWithAi = async () => {
    if (!aiGenPrompt.trim()) return;
    setIsAiGenerating(true);
    const toastId = toast.loading("AI Generating Code Snippet...");
    try {
      const res = await aiApi.complete({
        prompt: `Generate a production-ready code snippet for: "${aiGenPrompt}". Format purely as:
Title: <A concise 3-5 word title>
Language: <one of: typescript, javascript, python, go, rust, sql, bash, docker>
Description: <1-sentence description>
\`\`\`<language>
<code>
\`\`\``,
        context: '',
        action: 'generate_code',
        workspaceId: id,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) full += parsed.content;
          } catch {}
        }
      }

      // Parse AI output
      const codeMatch = full.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[2].trim() : full.trim();
      const lang = (codeMatch ? codeMatch[1].toLowerCase() : form.language) || 'typescript';
      const titleMatch = full.match(/Title:\s*(.+)/i);
      const descMatch = full.match(/Description:\s*(.+)/i);

      setForm({
        title: titleMatch ? titleMatch[1].trim() : aiGenPrompt.slice(0, 40),
        code: code,
        language: LANGUAGES.includes(lang) ? lang : 'typescript',
        description: descMatch ? descMatch[1].trim() : `AI-generated snippet for ${aiGenPrompt}`,
      });
      setAiGenPrompt("");
      toast.success("Snippet generated!", { id: toastId });
    } catch (err: any) {
      toast.error("AI Generation failed", { id: toastId });
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleRunCode = async (snippet: Snippet) => {
    setRunningId(snippet.id);
    try {
      const { data } = await snippetApi.execute({
        language: snippet.language,
        code: snippet.code,
        stdin: stdinInputs[snippet.id],
      });
      setRunOutputs(prev => ({
        ...prev,
        [snippet.id]: { output: data.output, timeMs: data.timeMs }
      }));
      toast.success(`Executed ${snippet.language} in ${data.timeMs}ms`);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || "Execution failed";
      setRunOutputs(prev => ({
        ...prev,
        [snippet.id]: { output: `❌ Error: ${errorMsg}`, timeMs: 0 }
      }));
      toast.error("Execution failed");
    } finally {
      setRunningId(null);
    }
  };

  const handleAiExplain = async (snippet: Snippet) => {
    setAiAnalyzingId(snippet.id);
    try {
      const res = await aiApi.complete({
        prompt: `Explain this ${snippet.language} code snippet cleanly in 2 concise bullet points with time/space complexity:\n\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\``,
        context: '',
        action: 'explain',
        workspaceId: id,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) full += parsed.content;
          } catch {}
        }
      }
      setAiExplanations(prev => ({ ...prev, [snippet.id]: full }));
    } catch {
      toast.error("AI explanation failed");
    } finally {
      setAiAnalyzingId(null);
    }
  };

  const deleteSnippet = async (snippetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await snippetApi.delete(snippetId);
      loadSnippets();
      toast.success("Snippet deleted");
    } catch {
      toast.error("Failed to delete snippet");
    }
  };

  const copyCode = (code: string, snippetId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(snippetId);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Code copied to clipboard!");
  };

  const filtered = snippets.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.language.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));
    const matchesLang = selectedLang === "all" || s.language.toLowerCase() === selectedLang.toLowerCase();
    return matchesSearch && matchesLang;
  });

  const langColors: Record<string, string> = {
    typescript: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    javascript: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    python: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    go: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    rust: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    sql: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
    bash: 'text-slate-300 bg-slate-400/10 border-slate-400/20',
    html: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
    css: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    docker: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading Code Vault...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-6 border-white/10 relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-md">
            <Code2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Code Snippet Vault</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {snippets.length} saved
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Interactive execution playground, semantic AI context store & team boilerplate.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-4 h-4" /> Save New Snippet
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets by title, description, or tag..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs focus:border-primary outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedLang("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedLang === "all"
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-white/[0.08]"
            }`}
          >
            All ({snippets.length})
          </button>
          {LANGUAGES.slice(0, 7).map((lang) => {
            const count = snippets.filter((s) => s.language.toLowerCase() === lang).length;
            return (
              <button
                key={lang}
                onClick={() => setSelectedLang(lang)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  selectedLang === lang
                    ? "bg-white/20 text-foreground border border-white/30"
                    : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                }`}
              >
                {lang} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Snippet Grid */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Code2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-sm font-semibold mb-1">{search ? "No matching snippets found" : "Vault is currently empty"}</h3>
          <p className="text-xs text-muted-foreground mb-4">Save reusable helpers, SQL queries, or Docker configurations.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" /> Save First Snippet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((snippet) => {
            const colorClass = langColors[snippet.language.toLowerCase()] || "text-slate-400 bg-slate-400/10 border-slate-400/20";
            const runData = runOutputs[snippet.id];
            const explanation = aiExplanations[snippet.id];

            return (
              <div
                key={snippet.id}
                className="glass-card p-5 flex flex-col justify-between border-white/10 hover:border-primary/40 transition-all group relative overflow-hidden"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {snippet.title}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${colorClass}`}>
                        {snippet.language}
                      </span>
                      <button
                        onClick={() => copyCode(snippet.code, snippet.id)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy Code"
                      >
                        {copiedId === snippet.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={(e) => deleteSnippet(snippet.id, e)}
                        className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {snippet.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                      {snippet.description}
                    </p>
                  )}

                  {/* Code Area */}
                  <div className="relative rounded-xl overflow-hidden bg-slate-950/90 border border-white/5 mb-3">
                    <pre className="p-3.5 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-48 leading-relaxed selection:bg-primary/40">
                      <code>{snippet.code}</code>
                    </pre>
                  </div>

                  {/* Action Row: Run Code, Stdin, & AI Explain */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => handleRunCode(snippet)}
                      disabled={runningId === snippet.id}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                    >
                      {runningId === snippet.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />} Run
                    </button>
                    <button
                      onClick={() => setActiveStdinId(activeStdinId === snippet.id ? null : snippet.id)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                        activeStdinId === snippet.id || stdinInputs[snippet.id]
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-white/[0.04] text-muted-foreground hover:text-foreground border-white/10 hover:bg-white/[0.08]"
                      }`}
                    >
                      <Terminal className="w-3 h-3" /> Stdin / Input {stdinInputs[snippet.id] && "•"}
                    </button>
                    <button
                      onClick={() => handleAiExplain(snippet)}
                      disabled={aiAnalyzingId === snippet.id}
                      className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                    >
                      {aiAnalyzingId === snippet.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Explain
                    </button>
                  </div>

                  {/* Stdin Drawer */}
                  {activeStdinId === snippet.id && (
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/30 mb-2 animate-fade-in">
                      <label className="text-[10px] font-bold text-amber-400 mb-1 block">Standard Input (stdin):</label>
                      <textarea
                        value={stdinInputs[snippet.id] || ""}
                        onChange={(e) => setStdinInputs((prev) => ({ ...prev, [snippet.id]: e.target.value }))}
                        placeholder="Provide standard input lines for input(), scanf(), etc..."
                        rows={2}
                        className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-[11px] font-mono text-slate-200 outline-none focus:border-amber-400/50 resize-none placeholder:text-muted-foreground/50"
                      />
                    </div>
                  )}

                  {/* Execution Output Drawer */}
                  {runData && (
                    <div className="p-3 rounded-xl bg-black/80 border border-emerald-500/30 text-[11px] font-mono text-emerald-400 mb-2 animate-fade-in">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-emerald-500/20 pb-1 mb-1.5">
                        <span className="flex items-center gap-1"><Terminal className="w-3 h-3 text-emerald-400" /> Console Output</span>
                        <span>{runData.timeMs}ms</span>
                      </div>
                      <pre className="whitespace-pre-wrap">{runData.output}</pre>
                    </div>
                  )}

                  {/* AI Explanation Drawer */}
                  {explanation && (
                    <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 text-[11px] text-slate-200 mb-2 animate-fade-in">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-primary mb-1">
                        <Sparkles className="w-3 h-3" /> AI Code Analysis:
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{explanation}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold"
                      style={{ backgroundColor: generateColor(snippet.author?.name || "") }}
                    >
                      {getInitials(snippet.author?.name || "?")}
                    </div>
                    <span>{snippet.author?.name || "Author"}</span>
                  </div>
                  <span>{formatRelativeTime(snippet.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Snippet Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-950 border border-white/10 rounded-2xl w-full max-w-xl p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" /> Save Code Snippet
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Generator Prompt Bar */}
            <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
              <input
                type="text"
                value={aiGenPrompt}
                onChange={(e) => setAiGenPrompt(e.target.value)}
                placeholder="Ask AI to generate snippet (e.g. 'PostgreSQL transaction helper in Go')..."
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                onKeyDown={(e) => { if (e.key === 'Enter') generateSnippetWithAi(); }}
              />
              <button
                type="button"
                onClick={generateSnippetWithAi}
                disabled={!aiGenPrompt.trim() || isAiGenerating}
                className="px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
              >
                {isAiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} AI Generate
              </button>
            </div>

            <form onSubmit={createSnippet} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Snippet Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., useDebounce Hook"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs focus:border-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Language</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-foreground outline-none"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-slate-950">{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description (Optional)</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Short description..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Code Content</label>
                <textarea
                  required
                  rows={8}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="// Paste or write code here..."
                  className="w-full p-3 rounded-xl bg-slate-950 font-mono text-xs text-slate-200 border border-white/10 focus:border-primary outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:bg-white/5 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl gradient-primary text-white text-xs font-semibold hover:opacity-90 shadow-md shadow-primary/20"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
