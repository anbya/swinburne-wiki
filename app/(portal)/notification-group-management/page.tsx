"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButtons, Chip, SearchInput } from "../_components/ui";
import { Icons } from "../_components/icons";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type GroupTarget = { id: string; name?: string | null };

type NotificationUserGroupItem = {
  id: string;
  title: string;
  created_at: string | null;
  target_count?: number | null;
  targets?: GroupTarget[] | null;
};

type GroupListResponse =
  | NotificationUserGroupItem[]
  | {
      data: NotificationUserGroupItem[];
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

function targetCount(g: NotificationUserGroupItem) {
  const targets = Array.isArray(g.targets) ? g.targets : [];
  if (targets.length > 0) return targets.length;
  if (typeof g.target_count === "number") return g.target_count;
  return 0;
}

export default function NotificationGroupManagementPage() {
  const [items, setItems] = useState<NotificationUserGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingItem, setEditingItem] = useState<NotificationUserGroupItem | null>(
    null
  );
  const [formTitle, setFormTitle] = useState("");
  const [formUserIds, setFormUserIds] = useState<string[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState("");
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
        const url = new URL("/api/notification-user-groups", window.location.origin);
        url.searchParams.set("page", String(nextPage));
        url.searchParams.set("pageSize", String(pageSize));
        if (nextSearch.trim()) url.searchParams.set("q", nextSearch.trim());

        const resp = await fetch(url.toString(), { cache: "no-store" });
        if (!resp.ok) {
          let message = `Failed to load groups (${resp.status})`;
          try {
            const body = await safeJson<{ error?: string }>(resp);
            if (body.error) message = body.error;
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        const payload = await safeJson<GroupListResponse>(resp);
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
        setError(e instanceof Error ? e.message : "Failed to load groups");
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
        if (!resp.ok) throw new Error(`Failed to load users (${resp.status})`);

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

  const userById = useMemo(() => {
    const map = new Map<string, UserItem>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const rows = useMemo(() => {
    return items.map((g) => ({
      id: g.id,
      title: g.title,
      members: targetCount(g),
      date: formatDate(g.created_at),
      raw: g,
    }));
  }, [items]);

  function openAddModal() {
    setModalMode("add");
    setEditingItem(null);
    setFormTitle("");
    setFormUserIds([]);
    setSelectedToAdd("");
    setModalError(null);
    setModalOpen(true);
  }

  function openEditModal(item: NotificationUserGroupItem) {
    setModalMode("edit");
    setEditingItem(item);
    setFormTitle(item.title ?? "");
    setFormUserIds(
      Array.isArray(item.targets)
        ? item.targets.map((t) => t.id).filter(Boolean)
        : []
    );
    setSelectedToAdd("");
    setModalError(null);
    setModalOpen(true);
  }

  function addUser(id: string) {
    const value = id.trim();
    if (!value) return;
    setFormUserIds((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }

  function removeUser(id: string) {
    setFormUserIds((prev) => prev.filter((x) => x !== id));
  }

  async function saveModal() {
    const title = formTitle.trim();
    const user_ids = formUserIds;

    if (!title) {
      setModalError("Title is required");
      return;
    }
    if (user_ids.length === 0) {
      setModalError("Select at least one user");
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      const resp = await fetch(
        modalMode === "add"
          ? "/api/notification-user-groups"
          : `/api/notification-user-groups/${encodeURIComponent(editingItem?.id ?? "")}`,
        {
          method: modalMode === "add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, user_ids }),
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

  async function handleDelete(item: NotificationUserGroupItem) {
    const ok = window.confirm("Delete this notification group?");
    if (!ok) return;

    const resp = await fetch(
      `/api/notification-user-groups/${encodeURIComponent(item.id)}`,
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

  const availableUsersToAdd = useMemo(() => {
    const selected = new Set(formUserIds);
    return users.filter((u) => !selected.has(u.id));
  }, [users, formUserIds]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Notification Group
      </h1>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            placeholder="Search group title or user..."
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
            Add Group
          </button>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-red-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th className="px-6 py-4">TITLE</th>
                <th className="px-6 py-4">MEMBERS</th>
                <th className="px-6 py-4">CREATED</th>
                <th className="px-6 py-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-zinc-600" colSpan={4}>
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-red-700" colSpan={4}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-zinc-600" colSpan={4}>
                    No results
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/50">
                    <td className="px-6 py-4 font-semibold text-zinc-900">
                      {row.title}
                    </td>
                    <td className="px-6 py-4 text-zinc-700">{row.members}</td>
                    <td className="px-6 py-4 text-zinc-700">{row.date}</td>
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
          aria-label={modalMode === "add" ? "Add Group" : "Edit Group"}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5">
              <div>
                <div className="text-lg font-semibold text-zinc-900">
                  {modalMode === "add" ? "Add Group" : "Edit Group"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {modalMode === "add"
                    ? "Create a notification group and select members."
                    : "Update the selected notification group."}
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
                  placeholder="Enter group title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-zinc-700">
                  Add user
                </label>

                {usersError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {usersError}
                  </div>
                ) : null}

                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-300 focus:outline-none"
                  value={selectedToAdd}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedToAdd("");
                    addUser(id);
                  }}
                  disabled={usersLoading}
                >
                  <option value="" disabled>
                    {usersLoading ? "Loading users..." : "Select user"}
                  </option>
                  {availableUsersToAdd.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>

                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  {formUserIds.length === 0 ? (
                    <div className="text-sm text-zinc-500">No users selected</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {formUserIds.map((id) => {
                        const u = userById.get(id);
                        const label = (u?.name ?? "").trim() || id;
                        return (
                          <Chip
                            key={id}
                            onClick={() => removeUser(id)}
                            active={false}
                          >
                            <span className="flex items-center gap-2">
                              <span className="max-w-[240px] truncate">{label}</span>
                              <span aria-hidden>×</span>
                            </span>
                          </Chip>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-zinc-500">
                    Click a chip to remove the user.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveModal()}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
                disabled={saving}
              >
                {saving ? "Saving..." : modalMode === "add" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
