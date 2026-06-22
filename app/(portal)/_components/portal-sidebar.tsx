"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Icons } from "./icons";
import { SearchInput } from "./ui";

type CategoryNode = {
  id: string;
  name: string;
  parent_id: string | null;
  children: CategoryNode[];
};

type ChatSession = {
  id: string;
  title: string;
  model_name: string | null;
  total_messages: number;
  created_at: string;
  updated_at: string;
};

const navItems = [
  { href: "/category-management", label: "Category Management", icon: Icons.users },
  { href: "/wiki-management", label: "Wiki Management", icon: Icons.grid },
];

function CategoryTreeItem({
  node,
  level,
  activeCategoryId,
}: {
  node: CategoryNode;
  level: number;
  activeCategoryId: string;
}) {
  const href = useMemo(() => {
    const id = encodeURIComponent(node.id);
    return `/wiki?categoryId=${id}`;
  }, [node.id]);

  const active = activeCategoryId === node.id;

  return (
    <li>
      <Link
        href={href}
        className={
          "block truncate rounded-md px-3 py-1.5 text-xs transition-colors " +
          (active
            ? "bg-red-50 text-red-700"
            : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900")
        }
        style={{ paddingLeft: 12 + level * 12 }}
        title={node.name}
        aria-current={active ? "page" : undefined}
      >
        {node.name}
      </Link>
      {node.children.length > 0 ? (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              activeCategoryId={activeCategoryId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PortalSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategoryId = (searchParams.get("categoryId") ?? "").trim();
  const activeSessionId = (searchParams.get("sessionId") ?? "").trim();
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadChatSessions = async (signal?: AbortSignal) => {
    const res = await fetch("/api/chat-sessions", {
      cache: "no-store",
      signal,
    }).catch(() => null);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as
      | { data?: ChatSession[] }
      | null;
    setChatSessions(json?.data ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      const res = await fetch("/api/categories", {
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => null);
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as
        | { tree?: CategoryNode[] }
        | null;
      if (cancelled) return;
      setCategoryTree(json?.tree ?? []);
    })();

    void loadChatSessions(controller.signal);

    const onRefreshChatSessions = () => {
      void loadChatSessions();
    };
    window.addEventListener("chat-sessions:refresh", onRefreshChatSessions);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("chat-sessions:refresh", onRefreshChatSessions);
    };
  }, []);

  useEffect(() => {
    if (!sessionSearchOpen) {
      setSessionSearchQuery("");
      return;
    }

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSessionSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sessionSearchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSessionSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const filteredChatSessions = useMemo(() => {
    const query = sessionSearchQuery.trim().toLowerCase();
    if (!query) return chatSessions;

    return chatSessions.filter((session) => {
      const haystacks = [session.title, session.model_name ?? ""];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [chatSessions, sessionSearchQuery]);

  const openChatSession = (sessionId: string) => {
    setSessionSearchOpen(false);
    setSessionSearchQuery("");
    router.push(`/dashboard?sessionId=${encodeURIComponent(sessionId)}`);
  };

  return (
    <>
      <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white">
      <div className="px-6 py-6">
        <div className="text-sm font-semibold text-red-700">Swinburne Wiki</div>
        <div className="text-xs text-zinc-500">Campus Knowledge Base</div>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/dashboard"
          title="New Chat Wiki"
          aria-label="New Chat Wiki"
          className={
            "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors " +
            (pathname === "/dashboard" && !activeSessionId
              ? "bg-red-800"
              : "bg-red-700 hover:bg-red-800")
          }
        >
          <Icons.plus className="size-4" />
          <span>New Chat Wiki</span>
        </Link>
      </div>

      <nav className="px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                    (active
                      ? "bg-red-50 text-red-700"
                      : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900")
                  }
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={
                      "inline-flex size-8 items-center justify-center rounded-md " +
                      (active ? "bg-red-100" : "bg-zinc-100")
                    }
                  >
                    <Icon className="size-4" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 flex flex-1 min-h-0 flex-col gap-6 px-3">
        <div className="flex min-h-0 flex-col">
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <Icons.chat className="size-3.5" />
              Chat Sessions
            </div>
            <button
              type="button"
              onClick={() => setSessionSearchOpen(true)}
              className="mt-2 flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700"
              aria-label="Search chat sessions"
            >
              <span className="flex items-center gap-2">
                <Icons.search className="size-3.5" />
                Search chats
              </span>
              <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                Ctrl K
              </span>
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {chatSessions.length === 0 ? (
              <div className="px-3 text-xs text-zinc-500">No chats yet.</div>
            ) : (
              <ul className="space-y-0.5">
                {chatSessions.map((session) => {
                  const href = `/dashboard?sessionId=${encodeURIComponent(session.id)}`;
                  const active = pathname === "/dashboard" && activeSessionId === session.id;

                  return (
                    <li key={session.id}>
                      <Link
                        href={href}
                        title={session.title}
                        className={
                          "block rounded-md px-3 py-2 transition-colors " +
                          (active
                            ? "bg-red-50 text-red-700"
                            : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900")
                        }
                        aria-current={active ? "page" : undefined}
                      >
                        <div className="truncate text-xs font-medium">{session.title}</div>
                        <div
                          className={
                            "mt-0.5 truncate text-[11px] " +
                            (active ? "text-red-600" : "text-zinc-500")
                          }
                        >
                          {session.total_messages} messages
                          {session.model_name ? ` • ${session.model_name}` : ""}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Categories
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {categoryTree.length === 0 ? (
              <div className="px-3 text-xs text-zinc-500">No categories yet.</div>
            ) : (
              <ul className="space-y-0.5">
                {categoryTree.map((node) => (
                  <CategoryTreeItem
                    key={node.id}
                    node={node}
                    level={0}
                    activeCategoryId={activeCategoryId}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-zinc-100">
            <Icons.logout className="size-4" />
          </span>
          Log out
        </button>
      </div>
      </aside>

      {sessionSearchOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/35 px-4 py-16 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="Search chat sessions"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSessionSearchOpen(false);
            }
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="relative w-full">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
                      <Icons.search className="size-4" />
                    </span>
                    <input
                      ref={searchInputRef}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                      placeholder="Search chat sessions..."
                      value={sessionSearchQuery}
                      onChange={(event) => setSessionSearchQuery(event.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
                  aria-label="Close search"
                  onClick={() => setSessionSearchOpen(false)}
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                    <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>Jump to a saved conversation.</span>
                <span>Esc to close</span>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
              {filteredChatSessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
                  {sessionSearchQuery.trim()
                    ? "No chat sessions matched your search."
                    : "No chat sessions yet."}
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredChatSessions.map((session) => {
                    const active =
                      pathname === "/dashboard" && activeSessionId === session.id;

                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => openChatSession(session.id)}
                          className={
                            "w-full rounded-xl px-4 py-3 text-left transition-colors " +
                            (active
                              ? "bg-red-50 text-red-700"
                              : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900")
                          }
                        >
                          <div className="truncate text-sm font-medium">{session.title}</div>
                          <div
                            className={
                              "mt-1 flex items-center gap-2 text-xs " +
                              (active ? "text-red-600" : "text-zinc-500")
                            }
                          >
                            <span>{session.total_messages} messages</span>
                            {session.model_name ? (
                              <>
                                <span aria-hidden="true">•</span>
                                <span className="truncate">{session.model_name}</span>
                              </>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
