"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  title: string;
  category: string;
  content: string;
};

const CATEGORY_OPTIONS = [
  "Akademik",
  "Keuangan",
  "IT Support",
  "Administrasi",
  "Kemahasiswaan",
];

export default function NewDocumentPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    title: "",
    category: "",
    content: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = useMemo(() => {
    return (
      submitting ||
      !form.title.trim() ||
      !form.category.trim() ||
      !form.content.trim()
    );
  }, [form.category, form.content, form.title, submitting]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: form.title,
        category: form.category,
        content: form.content,
      }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const json = (await res?.json().catch(() => null)) as
        | { error?: unknown }
        | null;
      const message =
        typeof json?.error === "string" && json.error.trim()
          ? json.error
          : "Gagal membuat dokumen.";
      setError(message);
      setSubmitting(false);
      return;
    }

    const json = (await res.json().catch(() => null)) as
      | { documentId?: unknown }
      | null;

    const documentId =
      typeof json?.documentId === "string" ? json.documentId : "";

    if (!documentId) {
      setError("Dokumen berhasil dibuat, tapi documentId tidak ditemukan.");
      setSubmitting(false);
      return;
    }

    router.push(`/documents/${encodeURIComponent(documentId)}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Dokumen Baru
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Buat dokumen baru, lalu sistem akan otomatis melakukan chunking dan
          generate embedding.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium text-zinc-800">
            Judul
          </label>
          <input
            id="title"
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-red-400"
            placeholder="Contoh: Panduan KRS"
            required
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="category"
            className="text-sm font-medium text-zinc-800"
          >
            Kategori
          </label>
          <select
            id="category"
            value={form.category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, category: e.target.value }))
            }
            className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-red-400"
            required
          >
            <option value="">Pilih kategori</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="content"
            className="text-sm font-medium text-zinc-800"
          >
            Konten
          </label>
          <textarea
            id="content"
            value={form.content}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, content: e.target.value }))
            }
            className="min-h-64 w-full rounded-lg border border-zinc-300 p-3 text-sm text-zinc-900 outline-none focus:border-red-400"
            placeholder="Tulis isi dokumen di sini..."
            required
          />
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {submitting ? "Menyimpan..." : "Simpan Dokumen"}
        </button>
      </form>
    </div>
  );
}
