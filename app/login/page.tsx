import Link from "next/link";
import { SsoMicrosoftButton } from "./SsoMicrosoftButton";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

function Icon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={
        className ??
        "inline-flex size-10 items-center justify-center rounded-lg bg-red-700 text-white"
      }
    >
      {children}
    </span>
  );
}

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <Icon>
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <path d="M12 2 2 7l10 5 10-5-10-5Zm0 8L2 5v12l10 5 10-5V5l-10 5Z" />
            </svg>
          </Icon>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-zinc-900">
              Swinburne Wiki
            </div>
          </div>
        </div>

        <nav className="text-sm text-zinc-700">
          <Link className="hover:text-zinc-900" href="#">
            Support
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-6 py-20">
        <section className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="relative px-8 py-10 text-center text-white">
            <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-md bg-white/10">
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                <path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Z" />
              </svg>
            </div>
            <h1 className="text-xl text-zinc-600 font-semibold">Welcome Back</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Access your staff resources
            </p>
          </div>

          <form className="space-y-5 px-8 py-7">
            {/* <div className="space-y-2">
              <label className="text-xs font-medium tracking-wide text-zinc-700">
                Student or Staff ID
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2-8 4.5V20h16v-1.5C20 16 16.42 14 12 14Z" />
                  </svg>
                </span>
                <input
                  className="h-11 w-full rounded-lg border border-red-200 bg-white pl-10 pr-3 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-red-300"
                  placeholder="Enter your ID"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium tracking-wide text-zinc-700">
                  Password
                </label>
                <Link className="text-xs font-medium text-red-700" href="#">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                    <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V7Z" />
                  </svg>
                </span>
                <input
                  type="password"
                  className="h-11 w-full rounded-lg border border-red-200 bg-white pl-10 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-red-300"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
              />
              Keep me logged in
            </label>

            <Link
              href="/dashboard"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-700 text-sm font-semibold text-white hover:bg-red-800"
            >
              Login to Portal
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                <path d="M13 5 20 12l-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5Z" />
              </svg>
            </Link>

            <div className="flex items-center gap-4 pt-2">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-xs text-zinc-500">OR</span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div> */}

            <SsoMicrosoftButton />

            <p className="pt-2 text-center text-xs text-zinc-600">
              Need help?{" "}
              <Link className="font-medium text-red-700" href="#">
                Contact IT Service Desk
              </Link>
            </p>
          </form>
        </section>
      </main>

      <footer className="mx-auto mt-auto w-full max-w-6xl px-6 pb-8 text-xs text-zinc-500">
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © 2024 Swinburne University of Technology. CRICOS Provider 00111D.
          </span>
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
  );
}
