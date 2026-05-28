"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type WikiPageRow = {
  id: string;
  title: string;
  content: string;
  attachments?: unknown;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

type Attachment = {
  url: string;
  name: string;
  mime?: string;
  size?: number;
};

function coerceAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  const next: Attachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const url = typeof v.url === "string" ? v.url : "";
    const name = typeof v.name === "string" ? v.name : "";
    if (!url.trim() || !name.trim()) continue;
    const mime = typeof v.mime === "string" ? v.mime : undefined;
    const size = typeof v.size === "number" ? v.size : undefined;
    next.push({ url, name, mime, size });
  }
  return next;
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10} GB`;
}

export default function WikiDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const id = typeof params?.id === "string" ? params.id : "";
  const categoryId = searchParams.get("categoryId") ?? "";

  const backHref = useMemo(() => {
    return categoryId.trim()
      ? `/wiki?categoryId=${encodeURIComponent(categoryId)}`
      : "/wiki";
  }, [categoryId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<WikiPageRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      if (!id.trim()) {
        setError("Invalid article ID");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/wiki-pages/${encodeURIComponent(id)}`, {
        cache: "no-store",
      }).catch(() => null);

      if (cancelled) return;

      if (!res || !res.ok) {
        const fallback = res?.status === 404 ? "Article not found" : "Failed to load article";
        const json = (await res?.json().catch(() => null)) as { error?: unknown } | null;
        const message = typeof json?.error === "string" && json.error.trim() ? json.error : fallback;
        setError(message);
        setRow(null);
        setLoading(false);
        return;
      }

      const json = (await res.json().catch(() => null)) as WikiPageRow | null;
      if (cancelled) return;

      setRow(json);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const attachments = useMemo(() => coerceAttachments(row?.attachments), [row?.attachments]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <Link href={backHref} className="text-sm font-semibold text-red-700 hover:underline">
          ← Back
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-700">{error}</div>
        ) : row ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{row.title}</h1>

            <div className="mt-2 text-xs text-zinc-500">
              {row.updated_at ? `Last updated: ${new Date(row.updated_at).toLocaleString()}` : null}
            </div>

            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
              {row.content ? (
                <div
                  className="text-sm leading-relaxed text-zinc-900"
                  dangerouslySetInnerHTML={{ __html: row.content }}
                />
              ) : (
                <div className="text-sm text-zinc-500">(No content)</div>
              )}
            </div>

            {attachments.length > 0 ? (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Attachments</div>
                <div className="mt-3 space-y-2">
                  {attachments.map((a) => {
                    const sizeLabel = formatBytes(a.size);
                    return (
                      <div
                        key={a.url}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-sm font-medium text-zinc-900 hover:underline"
                            title={a.name}
                          >
                            {a.name}
                          </a>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {a.mime ? a.mime : "file"}
                            {sizeLabel ? ` • ${sizeLabel}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-sm text-zinc-500">Article not found.</div>
        )}
      </section>
    </div>
  );
}
