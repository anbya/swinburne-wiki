"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { Icons } from "./icons";

type CategoryNode = {
  id: string;
  name: string;
  parent_id: string | null;
  children: CategoryNode[];
};

const navItems = [
  { href: "/category-management", label: "Category Management", icon: Icons.users },
  { href: "/wiki-management", label: "Wiki Management", icon: Icons.grid },
];

function CategoryTreeItem({
  node,
  level,
}: {
  node: CategoryNode;
  level: number;
}) {
  const href = useMemo(() => {
    const id = encodeURIComponent(node.id);
    return `/wiki-management?categoryId=${id}`;
  }, [node.id]);

  return (
    <li>
      <Link
        href={href}
        className="block truncate rounded-md px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
        style={{ paddingLeft: 12 + level * 12 }}
        title={node.name}
      >
        {node.name}
      </Link>
      {node.children.length > 0 ? (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <CategoryTreeItem key={child.id} node={child} level={level + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PortalSidebar() {
  const pathname = usePathname();
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);

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

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="flex w-72 flex-col border-r border-zinc-200 bg-white">
      <div className="px-6 py-6">
        <div className="text-sm font-semibold text-red-700">Swinburne Wiki</div>
        <div className="text-xs text-zinc-500">Campus Knowledge Base</div>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/dashboard"
          title="Search Wiki"
          aria-label="Search Wiki"
          className={
            "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors " +
            (pathname === "/dashboard"
              ? "bg-red-800"
              : "bg-red-700 hover:bg-red-800")
          }
        >
          <Icons.search className="size-4" />
          <span>Search Wiki</span>
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

      <div className="mt-6 flex-1 px-3">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Categories
        </div>
        {categoryTree.length === 0 ? (
          <div className="px-3 text-xs text-zinc-500">No categories yet.</div>
        ) : (
          <ul className="space-y-0.5">
            {categoryTree.map((node) => (
              <CategoryTreeItem key={node.id} node={node} level={0} />
            ))}
          </ul>
        )}
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
