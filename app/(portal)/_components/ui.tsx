"use client";

import Link from "next/link";
import { Icons } from "./icons";

export function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium " +
        (active
          ? "border-red-700 bg-red-700 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
      }
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "danger" | "warning" | "neutral";
}) {
  const styles: Record<typeof tone, string> = {
    success: "bg-green-100 text-green-800",
    danger: "bg-red-100 text-red-800",
    warning: "bg-amber-100 text-amber-800",
    neutral: "bg-zinc-100 text-zinc-700",
  };
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium " +
        styles[tone]
      }
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function SearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value?: string;
  onChange?: (next: string) => void;
}) {
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
        <Icons.search className="size-4" />
      </span>
      <input
        className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
    >
      {children}
    </Link>
  );
}

export function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}

export function ActionButtons({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
        aria-label="Edit"
      >
        <Icons.edit className="size-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
        aria-label="Delete"
      >
        <Icons.trash className="size-4" />
      </button>
    </div>
  );
}
