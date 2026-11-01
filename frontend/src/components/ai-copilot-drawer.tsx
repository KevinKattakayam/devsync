'use client';

import { errorMessage } from '@/lib/errors';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { aiApi } from '@/lib/api';
import { Sparkles, Send, Loader2, Bot, User, Trash2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, DrawerContent, DrawerTrigger, IconButton, Input } from '@/components/ui';
import { markdownToHtml } from '@/lib/markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AiCopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ask a question about this workspace. Relevant context may be retrieved when available.',
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const workspaceId = params?.id || pathname.match(/\/workspace\/([^\/]+)/)?.[1] || '';
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
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantId = `ai-${Date.now()}`;
    const initialAiMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, initialAiMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Gather dynamic workspace context
      const workspaceContext = `Current View: ${pathname}`;

      const res = await aiApi.complete({
        prompt: userMessage.content,
        context: workspaceContext,
        action: 'custom',
        workspaceId: workspaceId || 'default',
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream error');
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) {
              accumulated += parsed.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: accumulated } : msg,
                ),
              );
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to reach AI Copilot'));
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content:
                  '⚠️ Sorry, I encountered an error answering your request. Please try again.',
              }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Copied to clipboard!');
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="shell-copilot-trigger">
          <Sparkles aria-hidden="true" className="size-4" />
          AI Copilot
        </Button>
      </DrawerTrigger>
      <DrawerContent
        title="DevSync Copilot"
        description="Workspace AI assistant"
        className="shell-copilot"
      >
        <div className="mb-3 flex justify-end">
          <IconButton
            label="Clear chat"
            onClick={() => setMessages((previous) => previous.slice(0, 1))}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
        <div
          ref={scrollRef}
          aria-label="Conversation"
          role="log"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-1 text-muted-foreground">
                {msg.role === 'assistant' ? (
                  <Bot className="size-4" />
                ) : (
                  <User className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1 rounded-lg bg-secondary p-3 text-sm leading-relaxed">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {msg.role === 'assistant' ? 'Copilot' : 'You'}
                </p>
                {msg.role === 'assistant' ? (
                  <div
                    className="break-words"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                {msg.role === 'assistant' && msg.content && (
                  <IconButton
                    label={copiedId === msg.id ? 'Response copied' : 'Copy response'}
                    onClick={() => copyMessage(msg.content, msg.id)}
                    className="mt-2"
                  >
                    {copiedId === msg.id ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </IconButton>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Copilot is thinking…
            </p>
          )}
        </div>
        <form
          onSubmit={handleSendMessage}
          className="mt-4 flex items-center gap-2 border-t border-border pt-4"
        >
          <Input
            aria-label="Message to Copilot"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your workspace…"
          />
          <IconButton label="Send message" type="submit" disabled={!input.trim() || isLoading}>
            <Send className="size-4" />
          </IconButton>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
