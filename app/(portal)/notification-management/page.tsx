"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButtons, Badge, SearchInput } from "../_components/ui";
import { Icons } from "../_components/icons";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  user_id: string | null;
  user_name?: string | null;
  target_count?: number | null;
  targets?: Array<{ id: string; name?: string | null }> | null;
  created_at: string | null;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type NotificationListResponse =
  | NotificationItem[]
  | {
      data: NotificationItem[];
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

async function safeJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => null)) as T | null;
  if (data == null) throw new Error("Invalid server response");
  return data;
}

function recipientLabel(n: NotificationItem) {
  const targets = Array.isArray(n.targets) ? n.targets : [];
  if (targets.length === 1) {
    const t = targets[0];
    return (t?.name ?? "").trim() || t.id;
  }
  if (targets.length > 1) {
    return `${targets.length} users`;
  }

  if (n.user_name) return n.user_name;
  if (n.user_id) return n.user_id;
  return "—";
}

function typeForNotification(n: NotificationItem) {
  const t = `${n.title ?? ""} ${n.message ?? ""}`.toLowerCase();
  if (t.includes("sms")) return "SMS";
  if (t.includes("email") || t.includes("@")) return "Email";
  return "Push";
}

function StatCard({
  title,
  value,
  delta,
}: {
  title: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-zinc-500">{title}</div>
          <div className="mt-2 text-lg font-semibold text-zinc-900">{value}</div>
        </div>
        <div className="size-10 rounded-xl bg-zinc-100" aria-hidden />
      </div>
      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-2/3 bg-red-700" />
        </div>
        <div className="mt-2 text-xs text-red-700">{delta}</div>
      </div>
    </div>
  );
}

export default function NotificationManagementPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingItem, setEditingItem] = useState<NotificationItem | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formUserIds, setFormUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number, nextSearch: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/notifications", window.location.origin);
        url.searchParams.set("page", String(nextPage));
        url.searchParams.set("pageSize", String(pageSize));
        if (nextSearch.trim()) url.searchParams.set("q", nextSearch.trim());

        const resp = await fetch(url.toString(), { cache: "no-store" });
        if (!resp.ok) {
          let message = `Failed to load notifications (${resp.status})`;
          try {
            const body = await safeJson<{ error?: string }>(resp);
            if (body.error) message = body.error;
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        const payload = await safeJson<NotificationListResponse>(resp);
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
        setError(e instanceof Error ? e.message : "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

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
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      setUsersError(null);
      setUsersLoading(true);
      try {
        const resp = await fetch("/api/users", { cache: "no-store" });
        if (!resp.ok) {
          throw new Error(`Failed to load users (${resp.status})`);
        }
        const payload = await safeJson<
          | UserItem[]
          | {
              data: UserItem[];
            }
        >(resp);
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.data)
            ? payload.data
            : [];
        setUsers(list);
      } catch (e) {
        setUsersError(e instanceof Error ? e.message : "Failed to load users");
        setUsers([]);
      } finally {
        setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const rows = useMemo(() => {
    return items.map((n) => {
      const type = typeForNotification(n);
      return {
        id: n.id,
        title: n.title,
        type,
        group: recipientLabel(n),
        date: formatDate(n.created_at),
        status: "Delivered",
        tone: "success" as const,
        raw: n,
      };
    });
  }, [items]);

  function openAddModal() {
    setModalMode("add");
    setEditingItem(null);
    setFormTitle("");
    setFormMessage("");
    setFormUserIds([]);
    setModalError(null);
    setModalOpen(true);
  }

  function openEditModal(item: NotificationItem) {
    setModalMode("edit");
    setEditingItem(item);
    setFormTitle(item.title ?? "");
    setFormMessage(item.message ?? "");
    setFormUserIds(
      Array.isArray(item.targets)
        ? item.targets.map((t) => t.id).filter(Boolean)
        : item.user_id
          ? [item.user_id]
          : []
    );
    setModalError(null);
    setModalOpen(true);
  }

  async function saveModal() {
    const title = formTitle.trim();
    const message = formMessage.trim();
    const user_ids = formUserIds;

    if (!title) {
      setModalError("Title is required");
      return;
    }
    if (!message) {
      setModalError("Message is required");
      return;
    }
    if (user_ids.length === 0) {
      setModalError("Target user is required");
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      const resp = await fetch(
        modalMode === "add"
          ? "/api/notifications"
          : `/api/notifications/${encodeURIComponent(editingItem?.id ?? "")}`,
        {
          method: modalMode === "add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            message,
            user_ids,
          }),
        }
      );

      if (!resp.ok) {
        let messageText =
          modalMode === "add"
            ? `Failed to create (${resp.status})`
            : `Failed to update (${resp.status})`;
        try {
          const body = await safeJson<{ error?: string }>(resp);
          if (body.error) messageText = body.error;
        } catch {
          // ignore
        }
        setModalError(messageText);
        return;
      }

      setModalOpen(false);
      setPage(1);
      await fetchPage(1, search);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: NotificationItem) {
    const ok = window.confirm("Delete this notification?");
    if (!ok) return;

    const resp = await fetch(
      `/api/notifications/${encodeURIComponent(item.id)}`,
      { method: "DELETE" }
    );
    if (!resp.ok) {
      let messageText = `Failed to delete (${resp.status})`;
      try {
        const body = await safeJson<{ error?: string }>(resp);
        if (body.error) messageText = body.error;
      } catch {
        // ignore
      }
      window.alert(messageText);
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
        Notification Management
      </h1>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard title="DELIVERY SUCCESS" value="12,842" delta="+12%" />
        <StatCard title="PROCESSING" value="431" delta="Normal" />
        <StatCard title="INTERACTION" value="68.4%" delta="+4.2%" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            placeholder="Search notification title or group..."
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
          >
            <Icons.plus className="size-4" />
            Send New Notification
          </button>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-red-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th className="px-6 py-4">NOTIFICATION TITLE</th>
                <th className="px-6 py-4">TYPE</th>
                <th className="px-6 py-4">RECIPIENT GROUP</th>
                <th className="px-6 py-4">SENT DATE</th>
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
                    <td className="px-6 py-4 font-semibold text-zinc-900">
                      {row.title}
                    </td>
                    <td className="px-6 py-4 text-zinc-700">{row.type}</td>
                    <td className="px-6 py-4 text-zinc-700">{row.group}</td>
                    <td className="px-6 py-4 text-zinc-700">{row.date}</td>
                    <td className="px-6 py-4">
                      <Badge tone={row.tone}>{row.status}</Badge>
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
            Showing {startIndex} to {endIndex} of {total} results
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
          aria-label={modalMode === "add" ? "Send Notification" : "Edit Notification"}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5">
              <div>
                <div className="text-lg font-semibold text-zinc-900">
                  {modalMode === "add" ? "Send Notification" : "Edit Notification"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {modalMode === "add"
                    ? "Create a new notification."
                    : "Update the selected notification."}
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
                  Message
                </label>
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                  placeholder="Write message..."
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-zinc-700">
                  Target Users
                </label>
                {usersError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {usersError}
                  </div>
                ) : null}
                <select
                  multiple
                  className="min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-300 focus:outline-none"
                  value={formUserIds}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map(
                      (o) => o.value
                    );
                    setFormUserIds(values);
                  }}
                  disabled={usersLoading}
                >
                  {usersLoading ? (
                    <option value="" disabled>
                      Loading users...
                    </option>
                  ) : users.length === 0 ? (
                    <option value="" disabled>
                      No users
                    </option>
                  ) : (
                    users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))
                  )}
                </select>
                <div className="text-xs text-zinc-500">
                  Select one or more target users.
                </div>
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
