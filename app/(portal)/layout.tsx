import Link from "next/link";
import { PortalSidebar } from "./_components/portal-sidebar";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  const displayName = name.trim() || email.trim() || "User";
  const displayEmail = email.trim() || null;

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <PortalSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
          <div className="relative w-full max-w-xl">
            {/* <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
              <Icons.search className="size-4" />
            </span>
            <input
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
              placeholder="Search portal..."
            /> */}
          </div>

          <div className="flex items-center gap-3">
            {/* <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              aria-label="Notifications"
            >
              <Icons.bell className="size-5" />
            </button>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              aria-label="Help"
            >
              <Icons.help className="size-5" />
            </button> */}

            <div className="flex items-center gap-3 pl-2">
              <div className="text-right leading-tight">
                <div className="text-xs font-semibold text-zinc-900">
                  {displayName}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {displayEmail ?? "—"}
                </div>
              </div>
              <div className="size-10 rounded-full bg-zinc-200" aria-hidden />
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-8">{children}</main>

        <footer className="bg-zinc-50 px-6 py-6 text-xs text-zinc-500">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium text-zinc-700">Swinburne Wiki</div>
              <div>
                © 2024 Swinburne University of Technology. CRICOS Provider 00111D.
              </div>
            </div>
            <div className="flex items-center gap-5">
              <Link href="#" className="hover:text-zinc-700">
                Privacy
              </Link>
              <Link href="#" className="hover:text-zinc-700">
                Accessibility
              </Link>
              <Link href="#" className="hover:text-zinc-700">
                Terms of Use
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
