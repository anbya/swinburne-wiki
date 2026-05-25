'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icons } from '../_components/icons'

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
}

type WikiPageRow = {
  id: string
  title: string
  content: string
  attachments?: unknown
  category_id: string | null
  created_at: string
  updated_at: string
}

type Attachment = {
  url: string
  name: string
  mime?: string
  size?: number
}

type CategoriesResponse = {
  data: CategoryRow[]
}

type WikiListResponse =
  | WikiPageRow[]
  | {
      data: WikiPageRow[]
      meta: {
        page?: number
        pageSize?: number
        total?: number
        totalPages?: number
        q?: string | null
        categoryId?: string | null
      }
    }

function snippet(text: string, max = 180) {
  const withoutTags = text.replace(/<[^>]*>/g, ' ')
  const clean = withoutTags.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1) + '…'
}

function exec(command: string, value?: string) {
  try {
    document.execCommand(command, false, value)
  } catch {
    // ignore
  }
}

function coerceAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return []
  const next: Attachment[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    const url = typeof v.url === 'string' ? v.url : ''
    const name = typeof v.name === 'string' ? v.name : ''
    if (!url.trim() || !name.trim()) continue
    const mime = typeof v.mime === 'string' ? v.mime : undefined
    const size = typeof v.size === 'number' ? v.size : undefined
    next.push({ url, name, mime, size })
  }
  return next
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`
  if (bytes < 1024 * 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  return `${Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10} GB`
}

export function WikiManagementClient({
  initialCategoryId,
}: {
  initialCategoryId: string
}) {
  const categoryId = initialCategoryId.trim()

  const pageSize = 10

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [pages, setPages] = useState<WikiPageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState<string>('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftCategory, setDraftCategory] = useState<string>(categoryId)
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([])

  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const [saving, setSaving] = useState(false)

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryRow>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const categoriesSorted = useMemo(
    () => categories.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  )

  const reloadPages = async (nextPage: number) => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('page', String(nextPage))
    params.set('pageSize', String(pageSize))
    if (categoryId) params.set('categoryId', categoryId)

    const url = `/api/wiki-pages?${params.toString()}`

    const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
    if (!res || !res.ok) {
      setError('Gagal memuat wiki pages')
      setLoading(false)
      return
    }

    const json = (await res.json().catch(() => null)) as WikiListResponse | null
    const next = Array.isArray(json) ? json : (json?.data ?? [])
    const meta = Array.isArray(json) ? null : (json?.meta ?? null)

    const nextTotal = typeof meta?.total === 'number' ? meta.total : next.length
    const nextTotalPages = typeof meta?.totalPages === 'number' ? meta.totalPages : 1
    const nextPageFromMeta = typeof meta?.page === 'number' ? meta.page : nextPage

    setPages(next)
    setTotal(nextTotal)
    setTotalPages(Math.max(1, nextTotalPages))
    if (nextPageFromMeta !== nextPage) {
      setPage(Math.max(1, nextPageFromMeta))
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const res = await fetch('/api/categories', { cache: 'no-store' }).catch(
        () => null
      )
      if (cancelled) return
      if (!res || !res.ok) return
      const json = (await res.json().catch(() => null)) as CategoriesResponse | null
      if (cancelled) return
      setCategories(json?.data ?? [])
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      await reloadPages(page)
    })()
  }, [categoryId, page])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const openAddModal = () => {
    setError(null)
    setModalMode('add')
    setEditingId('')
    setDraftTitle('')
    setDraftContent('')
    setDraftAttachments([])
    setDraftCategory(categoryId)
    setModalOpen(true)
  }

  const openEditModal = (row: WikiPageRow) => {
    setError(null)
    setModalMode('edit')
    setEditingId(row.id)
    setDraftTitle(row.title)
    setDraftContent(row.content ?? '')
    setDraftAttachments(coerceAttachments(row.attachments))
    setDraftCategory(row.category_id ?? '')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving || uploading) return
    setModalOpen(false)
    setEditingId('')
    setDraftTitle('')
    setDraftContent('')
    setDraftAttachments([])
    setDraftCategory(categoryId)
  }

  useEffect(() => {
    if (!modalOpen) return
    if (!editorRef.current) return
    editorRef.current.innerHTML = draftContent || ''
  }, [modalOpen, modalMode, editingId])

  const syncEditorToState = () => {
    const html = editorRef.current?.innerHTML ?? ''
    setDraftContent(html)
  }

  const insertHtml = (html: string) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    exec('insertHTML', html)
    syncEditorToState()
  }

  const onUploadFile = async (file: File) => {
    setUploading(true)
    setError(null)

    const form = new FormData()
    form.set('file', file)

    const res = await fetch('/api/uploads', {
      method: 'POST',
      body: form,
    }).catch(() => null)

    setUploading(false)

    if (!res || !res.ok) {
      const fallback = 'Gagal upload file'
      const json = (await res?.json().catch(() => null)) as { error?: unknown } | null
      const message = typeof json?.error === 'string' && json.error.trim() ? json.error : fallback
      setError(message)
      return
    }

    const json = (await res.json().catch(() => null)) as
      | { url?: unknown; name?: unknown; mime?: unknown; size?: unknown }
      | null

    const url = typeof json?.url === 'string' ? json.url : ''
    const name = typeof json?.name === 'string' ? json.name : file.name
    const mime = typeof json?.mime === 'string' ? json.mime : file.type
    const size = typeof json?.size === 'number' ? json.size : file.size
    if (!url) {
      setError('Gagal upload file')
      return
    }

    setDraftAttachments((prev) => {
      if (prev.some((a) => a.url === url)) return prev
      return [...prev, { url, name, mime, size }]
    })
  }

  const onUploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    for (const f of list) {
      // eslint-disable-next-line no-await-in-loop
      await onUploadFile(f)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = draftTitle.trim()
    if (!t) return

    setSaving(true)
    setError(null)

    const isEditing = modalMode === 'edit' && Boolean(editingId)
    const url = isEditing ? `/api/wiki-pages/${editingId}` : '/api/wiki-pages'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: t,
        content: editorRef.current?.innerHTML ?? draftContent,
        category_id: draftCategory.trim() ? draftCategory.trim() : null,
        attachments: draftAttachments,
      }),
    }).catch(() => null)

    setSaving(false)

    if (!res || !res.ok) {
      const fallback = isEditing ? 'Gagal mengupdate wiki page' : 'Gagal membuat wiki page'
      const json = (await res?.json().catch(() => null)) as { error?: unknown } | null
      const message = typeof json?.error === 'string' && json.error.trim() ? json.error : fallback
      setError(message)
      return
    }

    closeModal()
    await reloadPages(1)
  }

  const activeCategoryName = categoryId
    ? categoriesById.get(categoryId)?.name ?? null
    : null

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Wiki Management</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kelola artikel wiki dan hubungkan ke category.
        </p>
        {activeCategoryName ? (
          <div className="mt-2 text-xs text-zinc-500">
            Filter category: <span className="font-medium text-zinc-700">{activeCategoryName}</span>{' '}
            <Link className="text-red-700 hover:underline" href="/wiki-management">
              reset
            </Link>
          </div>
        ) : null}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Daftar Artikel</h2>
            <p className="mt-1 text-xs text-zinc-500">Tampilkan data dalam table dengan pagination.</p>
            {error && !modalOpen ? (
              <div className="mt-2 text-xs text-red-700">{error}</div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
          >
            <Icons.plus className="size-4" />
            Tambah Artikel
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-xs font-semibold text-zinc-600">
                <th className="px-4 py-3">Judul</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Konten</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-500" colSpan={4}>
                    Memuat…
                  </td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-500" colSpan={4}>
                    Belum ada artikel.
                  </td>
                </tr>
              ) : (
                pages.map((p) => {
                  const catName = p.category_id
                    ? categoriesById.get(p.category_id)?.name ?? null
                    : null
                  return (
                    <tr key={p.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        <div className="truncate" title={p.title}>
                          {p.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{catName ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {p.content ? snippet(p.content) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                            aria-label="Edit"
                          >
                            <Icons.edit className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-500">
            {total === 0
              ? '0 data'
              : `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total}`}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Prev
            </button>
            <div className="text-xs font-medium text-zinc-600">
              Page {page} / {totalPages}
            </div>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/40" aria-hidden="true" />

          <div className="relative w-full max-h-[80vh] max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-zinc-900">
                {modalMode === 'edit' ? 'Edit Artikel' : 'Tambah Artikel'}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {modalMode === 'edit'
                  ? 'Ubah judul, category, dan konten artikel.'
                  : 'Buat artikel wiki baru.'}
              </p>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="text-xs font-medium text-zinc-700">Judul</label>
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Contoh: Cara akses Wi‑Fi Kampus"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Category (opsional)</label>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-300 focus:outline-none"
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                >
                  <option value="">— Tidak ada —</option>
                  {categoriesSorted.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Konten</label>
                <div className="mt-2 rounded-lg border border-zinc-200 bg-white">
                  <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-zinc-50 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        exec('bold')
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        exec('italic')
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        exec('underline')
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      U
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        exec('insertUnorderedList')
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      • List
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        exec('insertOrderedList')
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      1. List
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        const url = window.prompt('Link URL')
                        if (!url) return
                        exec('createLink', url)
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.focus()
                        exec('unlink')
                        syncEditorToState()
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Unlink
                    </button>

                    <div className="mx-1 h-5 w-px bg-zinc-200" aria-hidden />

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files
                        if (!files || files.length === 0) return
                        void onUploadFiles(files)
                        e.target.value = ''
                      }}
                    />

                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      <Icons.plus className="size-3" />
                      {uploading ? 'Uploading…' : 'Upload File'}
                    </button>
                  </div>

                  <div
                    ref={editorRef}
                    className="min-h-56 w-full px-3 py-2 text-sm text-zinc-900 focus:outline-none"
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    onInput={syncEditorToState}
                    onBlur={syncEditorToState}
                    suppressContentEditableWarning
                  />
                </div>
                {draftAttachments.length > 0 ? (
                  <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="text-xs font-semibold text-zinc-900">Attachments</div>
                    <div className="mt-2 space-y-2">
                      {draftAttachments.map((a) => {
                        const sizeLabel = formatBytes(a.size)
                        return (
                          <div
                            key={a.url}
                            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-sm font-medium text-zinc-900 hover:underline"
                                title={a.name}
                              >
                                {a.name}
                              </a>
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                {a.mime ? a.mime : 'file'}
                                {sizeLabel ? ` • ${sizeLabel}` : ''}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={saving || uploading}
                              onClick={() =>
                                setDraftAttachments((prev) => prev.filter((x) => x.url !== a.url))
                              }
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                              aria-label="Remove attachment"
                              title="Remove"
                            >
                              <Icons.trash className="size-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-1 text-[11px] text-zinc-500">
                  Konten disimpan sebagai HTML. Attachments tersimpan terpisah seperti email.
                </div>
              </div>

              {error ? <div className="text-xs text-red-700">{error}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving || uploading}
                  onClick={() => {
                    setError(null)
                    closeModal()
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {saving ? 'Menyimpan…' : modalMode === 'edit' ? 'Update' : 'Tambah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
