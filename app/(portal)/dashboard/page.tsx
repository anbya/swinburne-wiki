"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; score: number }>;
};

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + String(Math.random());
  }
}

export default function DashboardPage() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: newId(),
      role: "assistant",
      content:
        "Hello! Ask anything about campus information. My answers will be grounded in the most relevant wiki documents.",
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-8);

    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: text },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const fallback = "Sorry, I couldn't process your question right now.";
        const message =
          typeof json?.error === "string" && json.error.trim() ? json.error : fallback;

        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: message,
          },
        ]);
        return;
      }

      const json = (await res.json().catch(() => null)) as {
        answer?: unknown;
        sources?: unknown;
      } | null;

      const answer = typeof json?.answer === "string" ? json.answer : "";
      const sources = Array.isArray(json?.sources)
        ? json.sources
            .map((s) => {
              if (!s || typeof s !== "object") return null;
              const row = s as { title?: unknown; score?: unknown };
              return {
                title: typeof row.title === "string" && row.title.trim() ? row.title : "Untitled",
                score: typeof row.score === "number" ? row.score : 0,
              };
            })
            .filter((s): s is { title: string; score: number } => s != null)
        : [];

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content:
            answer ||
            "Sorry, I couldn't find a strong answer in the available documents yet.",
          sources,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "Sorry, the connection to the chat service failed. Please try again shortly.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div
          ref={listRef}
          className="max-h-[65vh] flex-1 space-y-4 overflow-y-auto px-6 py-6"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                "flex " + (m.role === "user" ? "justify-end" : "justify-start")
              }
            >
              <div
                className={
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed " +
                  (m.role === "user"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-900")
                }
              >
                {m.content}
                {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
                  <div className="mt-3 border-t border-zinc-300/70 pt-2 text-xs text-zinc-600">
                    <div className="mb-1 font-medium">Document sources:</div>
                    <ul className="space-y-1">
                      {m.sources.slice(0, 3).map((source, index) => (
                        <li key={`${m.id}-${source.title}-${index}`}>
                          {index + 1}. {source.title} ({Math.round(source.score * 100)}%)
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={onSend}
          className="border-t border-zinc-200 bg-white px-4 py-4"
        >
          <div className="flex items-end gap-3">
            <textarea
              className="min-h-11 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
              placeholder="Type your question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              rows={1}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Pipeline: Vector search, retrieve chunks, then generate the answer with Ollama.
          </div>
        </form>
      </div>
    </div>
  );
}
