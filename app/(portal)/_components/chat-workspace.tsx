"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from "@/src/lib/chat-models";

type ChatWorkspaceMode = "new" | "dashboard";

type ChatSource = {
  title: string;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

const welcomeMessage: ChatMessage = {
  id: "welcome-message",
  role: "assistant",
  content:
    "Hello! Ask anything about campus information. My answers will be grounded in the most relevant wiki documents.",
};

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + String(Math.random());
  }
}

function normalizeSources(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { title?: unknown; score?: unknown };
      return {
        title: typeof row.title === "string" && row.title.trim() ? row.title : "Untitled",
        score: typeof row.score === "number" ? row.score : 0,
      };
    })
    .filter((item): item is ChatSource => item != null);
}

export function ChatWorkspace({ mode }: { mode: ChatWorkspaceMode }) {
  const searchParams = useSearchParams();
  const sessionId = mode === "dashboard" ? (searchParams.get("sessionId") ?? "").trim() : "";

  return (
    <ChatWorkspaceInner
      key={mode === "dashboard" ? sessionId || "dashboard-empty" : "new-chat"}
      mode={mode}
      sessionId={sessionId}
    />
  );
}

function ChatWorkspaceInner({
  mode,
  sessionId,
}: {
  mode: ChatWorkspaceMode;
  sessionId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL);
  const [sending, setSending] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  useEffect(() => {
    if (mode !== "dashboard" || !sessionId) return;

    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`, {
        cache: "no-store",
      }).catch(() => null);

      if (cancelled) return;

      if (!res || !res.ok) {
        setMessages([
          {
            id: newId(),
            role: "assistant",
            content: "This chat session could not be loaded.",
          },
        ]);
        setLoadingSession(false);
        return;
      }

      const json = (await res.json().catch(() => null)) as
        | {
            data?: Array<{
              id?: unknown;
              role?: unknown;
              content?: unknown;
            }>;
          }
        | null;

      const nextMessages =
        json?.data
          ?.map((item) => {
            const role = item?.role === "user" ? "user" : item?.role === "assistant" ? "assistant" : null;
            const content =
              typeof item?.content === "string" && item.content.trim() ? item.content : "";

            if (!role || !content) return null;

            return {
              id: typeof item?.id === "string" && item.id.trim() ? item.id : newId(),
              role,
              content,
            } satisfies ChatMessage;
          })
          .filter((item): item is ChatMessage => item != null) ?? [];

      setMessages(nextMessages.length > 0 ? nextMessages : [welcomeMessage]);
      setLoadingSession(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, sessionId]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !sending && !loadingSession,
    [input, sending, loadingSession]
  );

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const history = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content }))
      .slice(-8);

    const userMessageId = newId();
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: userMessageId, role: "user", content: text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history,
          sessionId: sessionId || null,
          modelName: selectedModel,
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

      const json = (await res.json().catch(() => null)) as
        | {
            sessionId?: unknown;
            modelName?: unknown;
            answer?: unknown;
            sources?: unknown;
          }
        | null;

      const nextSessionId =
        typeof json?.sessionId === "string" && json.sessionId.trim() ? json.sessionId : null;
      const answer = typeof json?.answer === "string" ? json.answer : "";
      const sources = normalizeSources(json?.sources);

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

      if (nextSessionId && (!sessionId || pathname === "/chat/new")) {
        router.replace(`/dashboard?sessionId=${encodeURIComponent(nextSessionId)}`);
        router.refresh();
      }
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {mode === "new" ? "New Chat" : "Wiki Chat"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {mode === "new"
            ? "Start a fresh conversation with the wiki agent."
            : sessionId
              ? "Continue your saved conversation."
              : "Start a new conversation or open one from the sidebar."}
        </p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div
          ref={listRef}
          className="max-h-[65vh] flex-1 space-y-4 overflow-y-auto px-6 py-6"
        >
          {loadingSession ? (
            <div className="text-sm text-zinc-500">Loading conversation...</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  "flex " + (message.role === "user" ? "justify-end" : "justify-start")
                }
              >
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed " +
                    (message.role === "user"
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-900")
                  }
                >
                  {message.content}
                  {message.role === "assistant" &&
                  message.sources &&
                  message.sources.length > 0 ? (
                    <div className="mt-3 border-t border-zinc-300/70 pt-2 text-xs text-zinc-600">
                      <div className="mb-1 font-medium">Document sources:</div>
                      <ul className="space-y-1">
                        {message.sources.slice(0, 3).map((source, index) => (
                          <li key={`${message.id}-${source.title}-${index}`}>
                            {index + 1}. {source.title} ({Math.round(source.score * 100)}%)
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSend} className="border-t border-zinc-200 bg-white px-4 py-4">
          {mode === "new" ? (
            <div className="mb-4 grid gap-2 sm:max-w-sm">
              <label className="text-xs font-medium text-zinc-700">Model</label>
              <select
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-300 focus:outline-none"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={sending || loadingSession}
              >
                {CHAT_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.provider})
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-zinc-500">
                Default menggunakan {CHAT_MODEL_OPTIONS[0].label}. Model lain perlu tersedia di backend chat yang aktif.
              </div>
            </div>
          ) : null}

          <div className="flex items-end gap-3">
            <textarea
              className="min-h-11 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
              placeholder="Type your question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending || loadingSession}
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
