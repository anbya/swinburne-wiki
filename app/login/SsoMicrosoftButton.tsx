"use client";

import { signIn } from "next-auth/react";

export function SsoMicrosoftButton() {
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800 cursor-pointer"
      onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
        <path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z" />
      </svg>
      Continue with Microsoft
    </button>
  );
}
