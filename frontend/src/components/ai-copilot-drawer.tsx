"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useParams } from "next/navigation";
import { aiApi, documentApi, snippetApi, boardApi } from "@/lib/api";
import {
  Sparkles, X, Send, Loader2, Bot, User, Trash2,
  Copy, ChevronDown, Check, Terminal, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { markdownToHtml } from "@/lib/markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function AiCopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "👋 Hi! I'm your **DevSync AI Copilot**. I have full context of your workspace documents, sprint tasks, and code snippets.\n\nAsk me to write code, review architecture specs, or summarize your sprint!",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const workspaceId = params?.id || (pathname.match(/\/workspace\/([^\/]+)/)?.[1]) || "";
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantId = `ai-${Date.now()}`;
    const initialAiMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, initialAiMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Gather dynamic workspace context
      let workspaceContext = `Current View: ${pathname}`;

      const res = await aiApi.complete({
        prompt: userMessage.content,
        context: workspaceContext,
        action: "custom",
        workspaceId: workspaceId || "default",
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream error");
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) {
              accumulated += parsed.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: accumulated } : msg
                )
              );
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to reach AI Copilot");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: "⚠️ Sorry, I encountered an error answering your request. Please try again." }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard!");
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full gradient-primary text-white text-xs font-bold shadow-2xl hover:opacity-95 hover:scale-105 active:scale-95 transition-all shadow-primary/30 glow-sm"
        title="Open AI Copilot"
      >
        <Sparkles className="w-4 h-4 animate-spin text-amber-300" style={{ animationDuration: "4s" }} />
        <span>AI Copilot</span>
      </button>

      {/* Copilot Drawer */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] h-[540px] bg-slate-950/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/30">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white shadow-md">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground">DevSync Copilot</h3>
                <p className="text-[10px] text-muted-foreground">Workspace AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([messages[0]])}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear Chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
            {messages.map((msg) => {
              const isAi = msg.role === "assistant";
              return (
                <div key={msg.id} className={`flex gap-2.5 ${isAi ? "items-start" : "flex-row-reverse items-end"}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] flex-shrink-0 font-bold ${isAi ? "bg-primary/20 text-primary border border-primary/30" : "bg-indigo-600 text-white"}`}>
                    {isAi ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  </div>

                  <div className={`group relative max-w-[82%] p-3 rounded-2xl text-xs leading-relaxed ${isAi ? "bg-white/[0.04] border border-white/10 text-slate-200" : "gradient-primary text-white shadow-md shadow-primary/20"}`}>
                    {isAi ? (
                      <div
                        className="prose prose-invert prose-xs max-w-none text-slate-200"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {isAi && msg.content && (
                      <button
                        onClick={() => copyMessage(msg.content, msg.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md bg-black/60 hover:bg-black text-muted-foreground hover:text-foreground transition-all"
                        title="Copy"
                      >
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="animate-pulse">Copilot is thinking...</span>
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-black/40 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Copilot anything..."
              className="flex-1 bg-white/[0.05] border border-white/10 px-3 py-2 rounded-xl text-xs text-foreground outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl gradient-primary text-white disabled:opacity-40 hover:opacity-90 transition-all shadow-md shadow-primary/20"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
