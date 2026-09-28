"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { Send, Trash2 } from "lucide-react";
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
    sources: [],
  },
];

const HISTORY_KEY = "chatHistory";
const HISTORY_MAX = 50;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Persistence helpers ───────────────────────────────────────────────────

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: Message[] = JSON.parse(raw);
    // Never restore loading placeholders
    return parsed.filter((m) => !m.loading);
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  // Exclude loading placeholders and keep the last HISTORY_MAX
  const toSave = messages
    .filter((m) => !m.loading)
    .slice(-HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
}

// ── Network ───────────────────────────────────────────────────────────────

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
  return {
    reply: data.reply,
    sources: data.sources ?? [],
    grounded: data.grounded ?? false,
  };
}

// ── Sources line ──────────────────────────────────────────────────────────

function SourcesLine({
  sources,
  grounded,
}: {
  sources: ChunkSource[];
  grounded: boolean;
}) {
  if (!grounded) {
    return (
      <p className="mt-1.5 text-[11px] text-amber-600 leading-snug">
        Not backed by an official source. Confirm with your DSO.
      </p>
    );
  }
  if (sources.length === 0) return null;
  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-muted-foreground leading-snug">
        Related official guides:{" "}
        {sources.map((s, i) => (
          <span key={s.source}>
            {i > 0 && ", "}
            {SOURCE_NAMES[s.source] ?? s.source}
          </span>
        ))}
      </p>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Matched by topic. Confirm your own case with your DSO.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

function AskPageContent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Tracks whether the ?q= prefill has been sent this session
  const prefillSentRef = useRef(false);
  const searchParams = useSearchParams();

  // Restore history on mount (runs once)
  useEffect(() => {
    const history = loadHistory();
    setMessages(history.length > 0 ? history : INITIAL);
  }, []);

  // Scroll to bottom whenever messages change
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

    setMessages((prev) => {
      const next = [...prev, userMsg, placeholder];
      // Save without the loading placeholder
      saveHistory([...prev, userMsg]);
      return next;
    });
    setSending(true);

    try {
      const { reply, sources, grounded } = await fetchReply(text);
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === placeholderId
            ? { ...m, text: reply, sources, grounded, loading: false }
            : m
        );
        saveHistory(next);
        return next;
      });
    } catch (err) {
      const isRateLimited =
        err instanceof Error && err.message === "rate_limited";
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                text: isRateLimited
                  ? "You're asking fast, try again in a minute."
                  : "Something went wrong, try again.",
                grounded: true,
                sources: [],
                loading: false,
              }
            : m
        );
        saveHistory(next);
        return next;
      });
    } finally {
      setSending(false);
    }
  }, []);

  // Send ?q= prefill exactly once per page load
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

  function handleClearRequest() {
    setConfirmClear(true);
  }

  function handleClearConfirm() {
    localStorage.removeItem(HISTORY_KEY);
    setMessages(INITIAL);
    setConfirmClear(false);
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-end px-4 pt-3 pb-1 gap-2">
        {confirmClear ? (
          <>
            <span className="text-xs text-muted-foreground">Clear all messages?</span>
            <button
              onClick={handleClearConfirm}
              className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1"
            >
              Yes, clear
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={handleClearRequest}
            aria-label="Clear chat"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear chat
          </button>
        )}
      </div>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%]",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
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
              {!msg.loading &&
                msg.role === "assistant" &&
                msg.sources !== undefined && (
                  <SourcesLine
                    sources={msg.sources}
                    grounded={msg.grounded ?? true}
                  />
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
