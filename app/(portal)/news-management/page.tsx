"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButtons, Badge, SearchInput } from "../_components/ui";
import { Icons } from "../_components/icons";

type NewsItem = {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  created_at: string | null;
};

type NewsListResponse =
  | NewsItem[]
  | {
      data: NewsItem[];
      meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        q: string | null;
      };
    };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function excerpt(text: string, max = 36) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + "...";
}

async function safeJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => null)) as T | null;
  if (data == null) throw new Error("Invalid server response");
  return data;
}

type Category = "Campus" | "Research";

function categoryForTitle(title: string): Category {
  const lower = title.toLowerCase();
  if (lower.includes("research") || lower.includes("grant") || lower.includes("lab")) {
    return "Research";
  }
  return "Campus";
}

export default function NewsManagementPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formAuthorId, setFormAuthorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const fetchPage = useCallback(async (nextPage: number, nextSearch: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/news", window.location.origin);
      url.searchParams.set("page", String(nextPage));
      url.searchParams.set("pageSize", String(pageSize));
      if (nextSearch.trim()) url.searchParams.set("q", nextSearch.trim());

      const resp = await fetch(url.toString(), { cache: "no-store" });
      if (!resp.ok) {
        let message = `Failed to load news (${resp.status})`;
        try {
          const body = await safeJson<{ error?: string }>(resp);
          if (body.error) message = body.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const payload = await safeJson<NewsListResponse>(resp);
      if (Array.isArray(payload)) {
        setItems(payload);
        setTotal(payload.length);
        setTotalPages(1);
        setPage(1);
      } else {
        setItems(Array.isArray(payload.data) ? payload.data : []);
        setTotal(payload.meta.total);
        setTotalPages(payload.meta.totalPages);
        setPage(payload.meta.page);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchPage(page, search);
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchPage, page, search]);

  useEffect(() => {
    if (!modalOpen) return;
    const id = window.setTimeout(() => {
      titleRef.current?.focus();
    }, 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen]);

  const rows = useMemo(() => {
    return items
      .map((n) => {
        const derivedCategory = categoryForTitle(n.title || "");
        return {
          id: n.id,
          title: n.title,
          subtitle: excerpt(n.content || ""),
          category: derivedCategory,
          author: n.author_id ?? "—",
          date: formatDate(n.created_at),
          status: "Published",
          statusTone: "success" as const,
          raw: n,
        };
      });
  }, [items]);

  function openAddModal() {
    setModalMode("add");
    setEditingItem(null);
    setFormTitle("");
    setFormContent("");
    setFormAuthorId("");
    setModalError(null);
    setModalOpen(true);
  }

  function openEditModal(item: NewsItem) {
    setModalMode("edit");
    setEditingItem(item);
    setFormTitle(item.title ?? "");
    setFormContent(item.content ?? "");
    setFormAuthorId(item.author_id ?? "");
    setModalError(null);
    setModalOpen(true);
  }

  async function saveModal() {
    const title = formTitle.trim();
    const content = formContent.trim();
    const author_id = formAuthorId.trim();

    if (!title) {
      setModalError("Title is required");
      return;
    }
    if (!content) {
      setModalError("Content is required");
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      const resp = await fetch(
        modalMode === "add"
          ? "/api/news"
          : `/api/news/${encodeURIComponent(editingItem?.id ?? "")}`,
        {
          method: modalMode === "add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            author_id: author_id ? author_id : undefined,
          }),
        }
      );

      if (!resp.ok) {
        let message =
          modalMode === "add"
            ? `Failed to create (${resp.status})`
            : `Failed to update (${resp.status})`;
        try {
          const body = await safeJson<{ error?: string }>(resp);
          if (body.error) message = body.error;
        } catch {
          // ignore
        }
        setModalError(message);
        return;
      }

      setModalOpen(false);
      setPage(1);
      await fetchPage(1, search);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: NewsItem) {
    const ok = window.confirm("Delete this news item?");
    if (!ok) return;

    const resp = await fetch(`/api/news/${encodeURIComponent(item.id)}`,
      { method: "DELETE" }
    );
    if (!resp.ok) {
      let message = `Failed to delete (${resp.status})`;
      try {
        const body = await safeJson<{ error?: string }>(resp);
        if (body.error) message = body.error;
      } catch {
        // ignore
      }
      window.alert(message);
      return;
    }

    await fetchPage(page, search);
  }

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  const pageButtons = useMemo(() => {
    const tp = totalPages;
    if (tp <= 1) return [1];
    if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
    return [1, 2, 3, -1, tp];
  }, [totalPages]);

  function goTo(p: number) {
    const next = Math.min(Math.max(p, 1), totalPages);
    setPage(next);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        News Management
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Create, edit, and curate news articles for the student portal.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            placeholder="Search articles..."
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
          />
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
        >
          <Icons.plus className="size-4" />
          Add News
        </button>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-red-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th className="px-6 py-4">HEADLINE</th>
                <th className="px-6 py-4">CATEGORY</th>
                <th className="px-6 py-4">AUTHOR</th>
                <th className="px-6 py-4">PUBLISH DATE</th>
                <th className="px-6 py-4">STATUS</th>
                <th className="px-6 py-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-zinc-600" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-red-700" colSpan={6}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-zinc-600" colSpan={6}>
                    No results
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-zinc-200" aria-hidden />
                      <div>
                        <div className="font-semibold text-zinc-900">{row.title}</div>
                        <div className="text-xs text-zinc-500">{row.subtitle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone="neutral">{row.category}</Badge>
                  </td>
                  <td className="px-6 py-4 text-zinc-700">{row.author}</td>
                  <td className="px-6 py-4 text-zinc-700">{row.date}</td>
                  <td className="px-6 py-4">
                    <Badge tone={row.statusTone}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <ActionButtons
                      onEdit={() => openEditModal(row.raw)}
                      onDelete={() => void handleDelete(row.raw)}
                    />
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 text-xs text-zinc-500">
          <span>
            Showing {startIndex}-{endIndex} of {total} articles
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50"
              aria-label="Previous"
              onClick={() => goTo(page - 1)}
              disabled={loading || page <= 1}
            >
              ‹
            </button>
            {pageButtons.map((p) =>
              p === -1 ? (
                <span key="ellipsis" className="px-2">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goTo(p)}
                  disabled={loading}
                  className={
                    "inline-flex size-9 items-center justify-center rounded-lg " +
                    (p === page
                      ? "bg-red-700 text-white"
                      : "border border-zinc-200 bg-white hover:bg-zinc-50")
                  }
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50"
              aria-label="Next"
              onClick={() => goTo(page + 1)}
              disabled={loading || page >= totalPages}
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={modalMode === "add" ? "Add News" : "Edit News"}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5">
              <div>
                <div className="text-lg font-semibold text-zinc-900">
                  {modalMode === "add" ? "Add News" : "Edit News"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {modalMode === "add"
                    ? "Create a new news article."
                    : "Update the selected news article."}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                  <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {modalError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {modalError}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-zinc-700">
                  Title
                </label>
                <input
                  ref={titleRef}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                  placeholder="Enter title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-zinc-700">
                  Content
                </label>
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                  placeholder="Write content..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-zinc-700">
                  Author ID (optional)
                </label>
                <input
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                  placeholder="e.g. STAFF-8842"
                  value={formAuthorId}
                  onChange={(e) => setFormAuthorId(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-white px-6 py-4">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                onClick={() => void saveModal()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
