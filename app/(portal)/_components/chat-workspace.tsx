"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  getChatModelDisplayName,
  getChatModelProviderName,
  isSupportedChatModel,
} from "@/src/lib/chat-models";

type ChatWorkspaceMode = "new" | "dashboard";

type ChatSource = {
  title: string;
  score: number;
  sourceUrl: string | null;
  sourceType: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelName?: string | null;
  sources?: ChatSource[];
};

function isChatMessage(item: ChatMessage | null): item is ChatMessage {
  return item != null;
}

const welcomeMessage: ChatMessage = {
  id: "welcome-message",
  role: "assistant",
  content:
    "Hello! Ask anything about campus information. My answers will be grounded in the most relevant wiki documents.",
};

function shouldShowAssistantMetadata(message: ChatMessage) {
  return message.role === "assistant" && message.id !== welcomeMessage.id;
}

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
      const row = item as {
        title?: unknown;
        score?: unknown;
        sourceUrl?: unknown;
        sourceType?: unknown;
      };
      return {
        title: typeof row.title === "string" && row.title.trim() ? row.title : "Untitled",
        score: typeof row.score === "number" ? row.score : 0,
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        sourceType: typeof row.sourceType === "string" ? row.sourceType : null,
      };
    })
    .filter((item): item is ChatSource => item != null);
}

function getSourceHref(source: ChatSource) {
  const href = source.sourceUrl?.trim() ?? "";
  if (!href) return null;
  if (href.startsWith("/")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return null;
}

function getSourceOriginLabel(source: ChatSource) {
  if (source.sourceType === "wiki_page") return "Wiki page";
  if (source.sourceType === "manual") return "Manual document";
  if (source.sourceType?.trim()) return source.sourceType.replace(/_/g, " ");
  return source.sourceUrl ? "Document link" : "Stored document";
}

function renderSourceSummary(source: ChatSource) {
  const href = getSourceHref(source);
  const scoreLabel = source.score > 0 ? ` (${Math.round(source.score * 100)}%)` : "";

  if (href) {
    return (
      <>
        <a
          href={href}
          className="font-medium text-red-700 hover:underline"
          target={source.sourceUrl?.startsWith("http") ? "_blank" : undefined}
          rel={source.sourceUrl?.startsWith("http") ? "noreferrer" : undefined}
        >
          {source.title}
        </a>{" "}
        <span>
          from {getSourceOriginLabel(source)}
          {scoreLabel}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="font-medium text-zinc-800">{source.title}</span>{" "}
      <span>
        from {getSourceOriginLabel(source)}
        {scoreLabel}
      </span>
    </>
  );
}

function AssistantMessageBody({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-7 text-zinc-900 [&_a]:font-medium [&_a]:text-red-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded-md [&_code]:bg-white/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_hr]:border-zinc-300 [&_li]:marker:text-zinc-500 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-zinc-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ children, href }) => {
            const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);

            return (
              <a href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
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

  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_CHAT_MODEL);
  const [sending, setSending] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedModelLabel = getChatModelDisplayName(selectedModel);
  const selectedModelProvider = getChatModelProviderName(selectedModel);

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
              modelName?: unknown;
              sources?: unknown;
            }>;
          }
        | null;

      const nextMessages: ChatMessage[] =
        json?.data
          ?.map((item) => {
            const role = item?.role === "user" ? "user" : item?.role === "assistant" ? "assistant" : null;
            const content =
              typeof item?.content === "string" && item.content.trim() ? item.content : "";

            if (!role || !content) return null;

            const message: ChatMessage = {
              id: typeof item?.id === "string" && item.id.trim() ? item.id : newId(),
              role,
              content,
              modelName: typeof item?.modelName === "string" ? item.modelName : null,
              sources: normalizeSources(item?.sources),
            };

            return message;
          })
          .filter(isChatMessage) ?? [];

      setMessages(nextMessages.length > 0 ? nextMessages : [welcomeMessage]);
      const latestAssistantModel = [...nextMessages]
        .reverse()
        .find((message) => message.role === "assistant" && isSupportedChatModel(message.modelName))
        ?.modelName;
      if (latestAssistantModel) {
        setSelectedModel(latestAssistantModel);
      }
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
            modelName: selectedModel,
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
      const modelName = typeof json?.modelName === "string" ? json.modelName : selectedModel;

      if (isSupportedChatModel(modelName)) {
        setSelectedModel(modelName);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content:
            answer ||
            "Sorry, I couldn't find a strong answer in the available documents yet.",
          modelName,
          sources,
        },
      ]);

      if (nextSessionId && (mode === "new" || !sessionId)) {
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
          modelName: selectedModel,
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
                  {message.role === "assistant" ? (
                    <AssistantMessageBody content={message.content} />
                  ) : (
                    message.content
                  )}
                  {shouldShowAssistantMetadata(message) ? (
                    <div className="mt-3 border-t border-zinc-300/70 pt-2 text-xs text-zinc-600">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200">
                          Generated with {getChatModelDisplayName(message.modelName)}
                        </span>
                        {getChatModelProviderName(message.modelName) ? (
                          <span className="text-[11px] text-zinc-500">
                            {getChatModelProviderName(message.modelName)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mb-1">
                        Response details are shown below with the supporting document sources.
                      </div>
                      <div className="mb-1 font-medium">Document sources:</div>
                      {message.sources && message.sources.length > 0 ? (
                        <ul className="space-y-1">
                          {message.sources.slice(0, 3).map((source, index) => (
                            <li key={`${message.id}-${source.title}-${index}`}>
                              {index + 1}. {renderSourceSummary(source)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div>No source metadata is available for this response.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSend} className="border-t border-zinc-200 bg-white px-4 py-4">
          <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid gap-1.5 sm:max-w-[16rem]">
                <label className="text-xs font-medium text-zinc-700">Model</label>
                <select
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 focus:border-zinc-300 focus:outline-none"
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
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                <span className="rounded-full bg-white px-2 py-1 font-medium text-zinc-700 ring-1 ring-zinc-200">
                  Active: {selectedModelLabel}
                </span>
                {selectedModelProvider ? <span>{selectedModelProvider}</span> : null}
                {selectedModel === DEFAULT_CHAT_MODEL ? (
                  <span className="rounded-full bg-red-50 px-2 py-1 font-medium text-red-700 ring-1 ring-red-100">
                    Default local model
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">
              Default model is {CHAT_MODEL_OPTIONS[0].label} on the local Ollama backend. You can switch it anytime before sending the next message.
            </div>
          </div>

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
