"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { Icons } from "./icons";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategoryId = (searchParams.get("categoryId") ?? "").trim();
  const activeSessionId = (searchParams.get("sessionId") ?? "").trim();
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/categories", { cache: "no-store" }).catch(
        () => null
      );
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as
        | { tree?: CategoryNode[] }
        | null;
      if (cancelled) return;
      setCategoryTree(json?.tree ?? []);
    })();

    (async () => {
      const res = await fetch("/api/chat-sessions", { cache: "no-store" }).catch(
        () => null
      );
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as
        | { data?: ChatSession[] }
        | null;
      if (cancelled) return;
      setChatSessions(json?.data ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
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
          <div className="flex items-center gap-2 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <Icons.chat className="size-3.5" />
            Chat Sessions
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
  );
}
