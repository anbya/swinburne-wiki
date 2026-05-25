"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: newId(),
      role: "assistant",
      content:
        "Halo! Tanyakan apa pun tentang informasi kampus. (UI chat sudah siap; integrasi AI bisa ditambahkan berikutnya.)",
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: text },
      {
        id: newId(),
        role: "assistant",
        content:
          "Aku bisa bantu carikan di wiki. Saat ini belum ada koneksi ke AI/knowledge retrieval—mau aku sambungkan ke data wiki berikutnya?",
      },
    ]);
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
              placeholder="Ketik pertanyaan..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              Kirim
            </button>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Dashboard ini fokus ke chat seperti ChatGPT.
          </div>
        </form>
      </div>
    </div>
  );
}
