import Link from "next/link";
import { pool } from "@/lib/db";

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

type DocumentRow = {
  id: string;
  title: string;
  slug: string | null;
  source_type: string | null;
  source_url: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export default async function DocumentDetailPage({ params }: DocumentPageProps) {
  const { id } = await params;

  const documentResult = await pool.query(
    `SELECT
      id::text,
      title,
      slug,
      source_type,
      source_url,
      category,
      created_at,
      updated_at
     FROM documents
     WHERE id::text = $1
     LIMIT 1`,
    [id]
  );

  const row = (documentResult.rows[0] ?? null) as DocumentRow | null;

  if (!row) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-zinc-600">Dokumen tidak ditemukan.</p>
        <Link href="/documents/new" className="mt-4 inline-block text-sm text-red-700 hover:underline">
          Kembali ke form dokumen baru
        </Link>
      </div>
    );
  }

  const chunksResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM document_chunks
     WHERE document_id = $1`,
    [row.id]
  );

  const chunkCount = Number(chunksResult.rows[0]?.count ?? 0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <Link href="/documents/new" className="text-sm text-red-700 hover:underline">
          ← Buat dokumen lain
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">{row.title}</h1>

        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">ID</dt>
            <dd className="mt-1 break-all text-sm text-zinc-900">{row.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Slug</dt>
            <dd className="mt-1 text-sm text-zinc-900">{row.slug ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Kategori</dt>
            <dd className="mt-1 text-sm text-zinc-900">{row.category ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Source Type</dt>
            <dd className="mt-1 text-sm text-zinc-900">{row.source_type ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Jumlah Chunk</dt>
            <dd className="mt-1 text-sm text-zinc-900">{chunkCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Updated</dt>
            <dd className="mt-1 text-sm text-zinc-900">
              {new Date(row.updated_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
