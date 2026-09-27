"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
};

const INITIAL: Message[] = [
  {
    id: "init",
    role: "assistant",
    text: "Hi! Ask me anything about your OPT or STEM OPT status.",
  },
];

async function fetchReply(message: string): Promise<string> {
  const stage = localStorage.getItem("visaStage");
  const res = await fetch("http://localhost:8000/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...(stage && { stage }) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.reply;
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
      const reply = await fetchReply(text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId ? { ...m, text: reply, loading: false } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, text: "Something went wrong, try again.", loading: false }
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
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-foreground text-background rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm",
                msg.loading && "italic text-muted-foreground"
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="border-t border-border bg-background px-4 py-3 flex gap-2 items-end">
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
