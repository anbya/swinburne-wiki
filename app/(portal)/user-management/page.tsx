"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButtons, Badge, SearchInput } from "../_components/ui";
import { Icons } from "../_components/icons";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type UserListResponse =
  | UserItem[]
  | {
      data: UserItem[];
      meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        q: string | null;
      };
    };

async function safeJson<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => null)) as T | null;
  if (data == null) throw new Error("Invalid server response");
  return data;
}

export default function UserManagementPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingItem, setEditingItem] = useState<UserItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("Student");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number, nextSearch: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/users", window.location.origin);
        url.searchParams.set("page", String(nextPage));
        url.searchParams.set("pageSize", String(pageSize));
        if (nextSearch.trim()) url.searchParams.set("q", nextSearch.trim());

        const resp = await fetch(url.toString(), { cache: "no-store" });
        if (!resp.ok) {
          let message = `Failed to load users (${resp.status})`;
          try {
            const body = await safeJson<{ error?: string }>(resp);
            if (body.error) message = body.error;
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        const payload = await safeJson<UserListResponse>(resp);
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
        setError(e instanceof Error ? e.message : "Failed to load users");
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
      nameRef.current?.focus();
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

  const rows = useMemo(() => {
    return items.map((u) => {
      const role = u.role ?? "—";
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role,
        status: "Active",
        tone: "success" as const,
        raw: u,
      };
    });
  }, [items]);

  function openAddModal() {
    setModalMode("add");
    setEditingItem(null);
    setFormName("");
    setFormEmail("");
    setFormRole("Student");
    setModalError(null);
    setModalOpen(true);
  }

  function openEditModal(item: UserItem) {
    setModalMode("edit");
    setEditingItem(item);
    setFormName(item.name ?? "");
    setFormEmail(item.email ?? "");
    setFormRole(item.role ?? "Student");
    setModalError(null);
    setModalOpen(true);
  }

  async function saveModal() {
    const name = formName.trim();
    const email = formEmail.trim();
    const role = formRole.trim();

    if (!name) {
      setModalError("Name is required");
      return;
    }
    if (!email) {
      setModalError("Email is required");
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      const resp = await fetch(
        modalMode === "add"
          ? "/api/users"
          : `/api/users/${encodeURIComponent(editingItem?.id ?? "")}`,
        {
          method: modalMode === "add" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            role: role ? role : undefined,
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

  async function handleDelete(item: UserItem) {
    const ok = window.confirm("Delete this user?");
    if (!ok) return;

    const resp = await fetch(`/api/users/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            User Management
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Oversee and manage permissions for all Swinburne community members.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            placeholder="Search by name, ID, or email..."
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
            Add New User
          </button>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-red-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th className="px-6 py-4">USER DETAILS</th>
                <th className="px-6 py-4">STUDENT/STAFF ID</th>
                <th className="px-6 py-4">ROLE</th>
                <th className="px-6 py-4">STATUS</th>
                <th className="px-6 py-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-zinc-600" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-red-700" colSpan={5}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-zinc-600" colSpan={5}>
                    No results
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="size-10 rounded-full bg-zinc-200"
                          aria-hidden
                        />
                        <div>
                          <div className="font-semibold text-zinc-900">
                            {row.name}
                          </div>
                          <div className="text-xs text-zinc-500">{row.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-700">{row.id}</td>
                    <td className="px-6 py-4">
                      <Badge tone={row.role === "Admin" ? "danger" : "neutral"}>
                        {row.role}
                      </Badge>
                    </td>
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
              Showing {startIndex}-{endIndex} of {total} users
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
            aria-label={modalMode === "add" ? "Add User" : "Edit User"}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5">
                <div>
                  <div className="text-lg font-semibold text-zinc-900">
                    {modalMode === "add" ? "Add User" : "Edit User"}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {modalMode === "add" ? "Create a new user." : "Update the selected user."}
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
                  <label className="text-xs font-medium tracking-wide text-zinc-700">Name</label>
                  <input
                    ref={nameRef}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                    placeholder="Enter name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium tracking-wide text-zinc-700">Email</label>
                  <input
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                    placeholder="name@swin.edu.au"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium tracking-wide text-zinc-700">Role</label>
                  <select
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-300 focus:outline-none"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                  >
                    <option value="students">Student</option>
                    <option value="staff">Staff</option>
                    <option value="security">Security</option>
                  </select>
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
