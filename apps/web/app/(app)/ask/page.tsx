"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { Send, Trash2, BookOpen, AlertCircle } from "lucide-react";
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

const SUGGESTIONS = [
  "How long does it usually take to receive an EAD card?",
  "What counts toward the 90-day unemployment limit on OPT?",
  "Who is eligible for the STEM OPT extension?",
  "Do I need to report an address change to my DSO?",
];

const HISTORY_KEY = "chatHistory";
const HISTORY_MAX = 50;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Persistence ───────────────────────────────────────────────────────────

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: Message[] = JSON.parse(raw);
    return parsed.filter((m) => !m.loading);
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  const toSave = messages.filter((m) => !m.loading).slice(-HISTORY_MAX);
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

// ── Avatar ────────────────────────────────────────────────────────────────

function AssistantAvatar() {
  return (
    <div
      aria-hidden="true"
      className="w-7 h-7 rounded-full bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0 mt-0.5"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="18" height="18" rx="4" stroke="hsl(181 81% 31%)" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <path d="M4 14 L8 9 L11.5 12 L14.5 8" stroke="hsl(181 81% 31%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14.5" cy="7.5" r="1.5" fill="hsl(45 93% 51%)" />
      </svg>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-dot-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

// ── Sources ───────────────────────────────────────────────────────────────

function SourcePills({ sources }: { sources: ChunkSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <span
          key={s.source}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <BookOpen className="w-3 h-3" />
          {SOURCE_NAMES[s.source] ?? s.source}
        </span>
      ))}
    </div>
  );
}

// ── Message ───────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[65ch] rounded-2xl rounded-br-sm px-4 py-2.5 text-small leading-relaxed
            bg-primary text-primary-foreground dark:bg-teal dark:text-white"
        >
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 items-start">
      <AssistantAvatar />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "max-w-[65ch] rounded-2xl rounded-bl-sm px-4 py-2.5 text-small leading-relaxed",
            "bg-muted text-foreground"
          )}
        >
          {msg.loading ? <TypingDots /> : msg.text}
        </div>

        {!msg.loading && msg.sources !== undefined && (
          <div className="mt-1.5 ml-0.5">
            {/* Grounded: show source pills + confirmation line */}
            {msg.grounded && msg.sources.length > 0 && (
              <>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Related official guides:
                </p>
                <SourcePills sources={msg.sources} />
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                  Matched by topic. Confirm your own case with your DSO.
                </p>
              </>
            )}
            {/* Not grounded: amber note */}
            {!msg.grounded && (
              <div className="flex items-start gap-1.5 mt-1">
                <AlertCircle className="w-3 h-3 text-watch mt-0.5 shrink-0" />
                <p className="text-[11px] text-watch leading-snug">
                  Not backed by an official source. Confirm with your DSO.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
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
  const prefillSentRef = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const history = loadHistory();
    setMessages(history.length > 0 ? history : INITIAL);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text };
    const placeholderId = `a-${Date.now() + 1}`;
    const placeholder: Message = {
      id: placeholderId,
      role: "assistant",
      text: "",
      loading: true,
    };

    setMessages((prev) => {
      saveHistory([...prev, userMsg]);
      return [...prev, userMsg, placeholder];
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
                  ? "You're asking fast. Try again in a minute."
                  : "Something went wrong. Try again.",
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

  // Show suggestions only when displaying the initial greeting (no real turns)
  const showSuggestions =
    messages.length === 1 && messages[0].id === "init" && !sending;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-end px-4 pt-3 pb-1 gap-2">
        {confirmClear ? (
          <>
            <span className="text-caption text-muted-foreground">Clear all messages?</span>
            <button
              onClick={() => {
                localStorage.removeItem(HISTORY_KEY);
                setMessages(INITIAL);
                setConfirmClear(false);
              }}
              className="text-caption font-semibold text-over hover:text-over/80 px-2 py-1"
            >
              Yes, clear
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="text-caption text-muted-foreground hover:text-foreground px-2 py-1"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            aria-label="Clear chat"
            className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear chat
          </button>
        )}
      </div>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-4">
        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} />
        ))}

        {/* Suggestion chips */}
        {showSuggestions && (
          <div className="flex flex-col gap-2 pt-2" aria-label="Suggested questions">
            <p className="text-caption text-muted-foreground">Common questions:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className={cn(
                    "rounded-full border border-border bg-card px-3 py-1.5 text-caption text-foreground",
                    "hover:border-teal/60 hover:bg-muted transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Sticky input bar ── */}
      <div className="border-t border-border bg-background/95 backdrop-blur-sm shadow-[0_-2px_12px_rgba(0,0,0,0.06)] px-4 pt-3 pb-safe-bottom pb-3 flex flex-col gap-2">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your status…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-small placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 max-h-[120px]"
          />
          <Button
            onClick={send}
            size="icon"
            aria-label="Send"
            disabled={!input.trim() || sending}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
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
