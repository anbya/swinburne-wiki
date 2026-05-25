'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icons } from '../_components/icons'

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
}

type CategoryNode = CategoryRow & { children: CategoryNode[] }

type CategoriesResponse = {
  data: CategoryRow[]
  tree: CategoryNode[]
}

function collectSubtreeIds(nodes: CategoryNode[], targetId: string): Set<string> {
  const result = new Set<string>()

  const collectAll = (node: CategoryNode) => {
    result.add(node.id)
    for (const child of node.children) collectAll(child)
  }

  const findAndCollect = (items: CategoryNode[]): boolean => {
    for (const item of items) {
      if (item.id === targetId) {
        collectAll(item)
        return true
      }
      if (findAndCollect(item.children)) return true
    }
    return false
  }

  findAndCollect(nodes)
  return result
}

export function CategoryManagementClient() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flat, setFlat] = useState<CategoryRow[]>([])
  const [tree, setTree] = useState<CategoryNode[]>([])

  const pageSize = 10
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState<string>('')
  const [draftName, setDraftName] = useState('')
  const [draftParentId, setDraftParentId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const categoriesSorted = useMemo(
    () => flat.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [flat]
  )

  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryRow>()
    for (const item of flat) map.set(item.id, item)
    return map
  }, [flat])

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of flat) map.set(item.id, item.name)
    return map
  }, [flat])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(categoriesSorted.length / pageSize))
  }, [categoriesSorted.length])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return categoriesSorted.slice(start, start + pageSize)
  }, [categoriesSorted, page])

  const forbiddenParentIds = useMemo(() => {
    if (!modalOpen || modalMode !== 'edit' || !editingId) return new Set<string>()
    const set = collectSubtreeIds(tree, editingId)
    set.add(editingId)
    return set
  }, [modalOpen, modalMode, editingId, tree])

  const allowedParentOptions = useMemo(() => {
    if (!modalOpen) return categoriesSorted
    if (modalMode !== 'edit' || !editingId) return categoriesSorted
    return categoriesSorted.filter((c) => !forbiddenParentIds.has(c.id))
  }, [modalOpen, modalMode, editingId, categoriesSorted, forbiddenParentIds])

  const reload = async () => {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/categories', { cache: 'no-store' }).catch(() => null)
    if (!res || !res.ok) {
      setError('Gagal memuat categories')
      setLoading(false)
      return
    }

    const json = (await res.json().catch(() => null)) as CategoriesResponse | null
    setFlat(json?.data ?? [])
    setTree(json?.tree ?? [])
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/categories', { cache: 'no-store' }).catch(
        () => null
      )
      if (cancelled) return
      if (!res || !res.ok) {
        setError('Gagal memuat categories')
        setLoading(false)
        return
      }

      const json = (await res.json().catch(() => null)) as CategoriesResponse | null
      if (cancelled) return
      setFlat(json?.data ?? [])
      setTree(json?.tree ?? [])
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!modalOpen || modalMode !== 'edit') return
    if (draftParentId && forbiddenParentIds.has(draftParentId)) {
      setDraftParentId('')
    }
  }, [modalOpen, modalMode, draftParentId, forbiddenParentIds])

  const openAddModal = () => {
    setError(null)
    setModalMode('add')
    setEditingId('')
    setDraftName('')
    setDraftParentId('')
    setModalOpen(true)
  }

  const openEditModal = (id: string) => {
    const current = categoryById.get(id)
    if (!current) return

    setError(null)
    setModalMode('edit')
    setEditingId(id)
    setDraftName(current.name)
    setDraftParentId(current.parent_id ?? '')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditingId('')
    setDraftName('')
    setDraftParentId('')
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = draftName.trim()
    if (!trimmed) return

    setSaving(true)
    setError(null)

    const isEditing = modalMode === 'edit' && Boolean(editingId)
    const url = isEditing ? `/api/categories/${editingId}` : '/api/categories'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        parent_id: draftParentId.trim() ? draftParentId.trim() : null,
      }),
    }).catch(() => null)

    setSaving(false)

    if (!res || !res.ok) {
      const fallback = isEditing ? 'Gagal mengupdate category' : 'Gagal membuat category'
      const json = (await res?.json().catch(() => null)) as { error?: unknown } | null
      const message = typeof json?.error === 'string' && json.error.trim() ? json.error : fallback
      setError(message)
      return
    }

    closeModal()
    await reload()
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Category Management</h1>
        <p className="mt-1 text-sm text-zinc-600">Kelola struktur kategori untuk wiki kampus.</p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Daftar Categories</h2>
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
            Tambah Category
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-xs font-semibold text-zinc-600">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-500" colSpan={3}>
                    Memuat…
                  </td>
                </tr>
              ) : pagedItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-500" colSpan={3}>
                    Belum ada category.
                  </td>
                </tr>
              ) : (
                pagedItems.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 font-medium text-zinc-900">{row.name}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {row.parent_id ? categoryNameById.get(row.parent_id) ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => openEditModal(row.id)}
                          className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                          aria-label="Edit"
                        >
                          <Icons.edit className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-500">
            {(() => {
              const total = categoriesSorted.length
              if (total === 0) return '0 data'
              const start = (page - 1) * pageSize + 1
              const end = Math.min(page * pageSize, total)
              return `Menampilkan ${start}–${end} dari ${total}`
            })()}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
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
              disabled={page >= totalPages}
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

          <div className="relative w-full max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-zinc-900">
                {modalMode === 'edit' ? 'Edit Category' : 'Tambah Category'}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {modalMode === 'edit'
                  ? 'Ubah nama dan parent category.'
                  : 'Buat category baru untuk struktur wiki.'}
              </p>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="text-xs font-medium text-zinc-700">Nama</label>
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Contoh: Akademik"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Parent (opsional)</label>
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-300 focus:outline-none"
                  value={draftParentId}
                  onChange={(e) => setDraftParentId(e.target.value)}
                >
                  <option value="">— Tidak ada —</option>
                  {allowedParentOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {error ? <div className="text-xs text-red-700">{error}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
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
                  disabled={saving}
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
