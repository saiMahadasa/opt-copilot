"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ChunkSource = { source: string; score: number };

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
  sources?: ChunkSource[];
  grounded?: boolean;
};

const SOURCE_NAMES: Record<string, string> = {
  "opt.md": "OPT guide",
  "stem-opt.md": "STEM OPT guide",
  "cpt.md": "CPT guide",
};

const INITIAL: Message[] = [
  {
    id: "init",
    role: "assistant",
    text: "Hi! Ask me anything about your OPT or STEM OPT status.",
    grounded: true,
  },
];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchReply(
  message: string
): Promise<{ reply: string; sources: ChunkSource[]; grounded: boolean }> {
  const stage = localStorage.getItem("visaStage");
  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...(stage && { stage }) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error("rate_limited");
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return { reply: data.reply, sources: data.sources ?? [], grounded: data.grounded ?? false };
}

function SourcesLine({ sources, grounded }: { sources: ChunkSource[]; grounded: boolean }) {
  if (!grounded) {
    return (
      <p className="mt-1.5 text-[11px] text-amber-600 leading-snug">
        Not backed by an official source. Confirm with your DSO.
      </p>
    );
  }
  if (sources.length === 0) return null;
  return (
    <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
      Sources:{" "}
      {sources.map((s, i) => (
        <span key={s.source}>
          {i > 0 && ", "}
          {SOURCE_NAMES[s.source] ?? s.source}
        </span>
      ))}
    </p>
  );
}

function AskPageContent() {
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prefillSentRef = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text };
    const placeholderId = `a-${Date.now() + 1}`;
    const placeholder: Message = {
      id: placeholderId,
      role: "assistant",
      text: "typing…",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setSending(true);

    try {
      const { reply, sources, grounded } = await fetchReply(text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, text: reply, sources, grounded, loading: false }
            : m
        )
      );
    } catch (err) {
      const isRateLimited = err instanceof Error && err.message === "rate_limited";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                text: isRateLimited
                  ? "You're asking fast, try again in a minute."
                  : "Something went wrong, try again.",
                grounded: true,
                loading: false,
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !prefillSentRef.current) {
      prefillSentRef.current = true;
      sendMessage(q);
    }
  }, [searchParams, sendMessage]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div className={cn("max-w-[80%]", msg.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-foreground text-background rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm",
                  msg.loading && "italic text-muted-foreground"
                )}
              >
                {msg.text}
              </div>
              {!msg.loading && msg.role === "assistant" && msg.sources !== undefined && (
                <SourcesLine sources={msg.sources} grounded={msg.grounded ?? true} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="border-t border-border bg-background px-4 pt-3 pb-2 flex flex-col gap-2">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your status…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button
            onClick={send}
            size="icon"
            aria-label="Send"
            disabled={sending}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground pb-1">
          General information, not legal advice.
        </p>
      </div>

    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense>
      <AskPageContent />
    </Suspense>
  );
}
