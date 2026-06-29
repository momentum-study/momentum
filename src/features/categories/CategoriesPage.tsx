import { useState } from 'react'
import { useUndo } from '../../lib/use-undo'
import { v4 as uuid } from 'uuid'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { isoNow } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { ColorPicker } from '../../components/ui/ColorPicker'
import type { Category } from '../../domain/types'
interface CategoryFormData {
  name: string
  scope: Category['scope']
  color: string
}

const emptyForm: CategoryFormData = {
  name: '',
  scope: 'academic',
  color: '#6366f1',
}

export default function CategoriesPage() {
  const { data, isLoading, loadData } = useData()
  const [showModal, setShowModal] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const { push } = useUndo()

  if (isLoading) return <PageSpinner />

  const academic = data.categories.filter((c) => c.scope === 'academic' && !c.deletedAt)
  const nonAcademic = data.categories.filter((c) => c.scope === 'nonAcademic' && !c.deletedAt)

  function openAdd() {
    setEditCategory(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(cat: Category) {
    setEditCategory(cat)
    setForm({ name: cat.name, scope: cat.scope, color: cat.color })
    setShowModal(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const now = isoNow()
      if (editCategory) {
        await db.categories.update(editCategory.id, {
          name: form.name.trim(),
          scope: form.scope,
          color: form.color,
          updatedAt: now,
        })
      } else {
        await db.categories.add({
          id: uuid(),
          name: form.name.trim(),
          scope: form.scope,
          color: form.color,
          createdAt: now,
          updatedAt: now,
        })
      }
      await loadData()
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCat() {
    if (!deleteConfirm) return
    setSaving(true)
    try {
      const now = isoNow()
      const catId = deleteConfirm.id
      // Capture subjects that will be soft-deleted so we can restore them on undo.
      const affectedSubjects = data.subjects
        .filter((s) => s.categoryId === catId && !s.deletedAt)
        .map((s) => ({ id: s.id, prevDeletedAt: s.deletedAt ?? null }))
      await db.categories.update(catId, { deletedAt: now, updatedAt: now })
      for (const subj of affectedSubjects) {
        await db.subjects.update(subj.id, { deletedAt: now, updatedAt: now })
      }
      await loadData()
      const originalCat = { ...deleteConfirm }
      const subjectCount = affectedSubjects.length
      push({
        description:
          subjectCount === 0
            ? `Deleted category "${originalCat.name}"`
            : `Deleted category "${originalCat.name}" and ${subjectCount} focus area${subjectCount === 1 ? '' : 's'}`,
        undo: async () => {
          await db.categories.update(originalCat.id, { deletedAt: null, updatedAt: isoNow() })
          for (const subj of affectedSubjects) {
            await db.subjects.update(subj.id, {
              deletedAt: subj.prevDeletedAt,
              updatedAt: isoNow(),
            })
          }
          await loadData()
        },
        redo: async () => {
          const redoNow = isoNow()
          await db.categories.update(originalCat.id, { deletedAt: redoNow, updatedAt: redoNow })
          for (const subj of affectedSubjects) {
            await db.subjects.update(subj.id, { deletedAt: redoNow, updatedAt: redoNow })
          }
          await loadData()
        },
      })
      setDeleteConfirm(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Categories</h2>
        <Button variant="primary" size="sm" onClick={openAdd}>Add Category</Button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
          Academic
        </h3>
        {academic.length === 0 ? (
          <EmptyState title="No academic categories" description="Add categories like English, Maths, Science." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {academic.map((cat) => (
              <Card key={cat.id}>
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: cat.color }} />
                  <div className="flex-1 font-medium text-slate-800 dark:text-slate-100">{cat.name}</div>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(cat)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(cat)}>Delete</Button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {(() => { const n = data.subjects.filter((s) => s.categoryId === cat.id && !s.deletedAt).length; return n === 0 ? 'No focus areas' : `${n} focus area${n === 1 ? '' : 's'}`; })()}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          General
        </h3>
        {nonAcademic.length === 0 ? (
          <EmptyState title="No general categories" description="Add categories like Chores, Hobbies." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nonAcademic.map((cat) => (
              <Card key={cat.id}>
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: cat.color }} />
                  <div className="flex-1 font-medium text-slate-800 dark:text-slate-100">{cat.name}</div>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(cat)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(cat)}>Delete</Button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {(() => { const n = data.subjects.filter((s) => s.categoryId === cat.id && !s.deletedAt).length; return n === 0 ? 'No focus areas' : `${n} focus area${n === 1 ? '' : 's'}`; })()}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editCategory ? 'Edit Category' : 'Add Category'}>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. English" />
          </div>
          <div>
            <label className="label">Scope</label>
            <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as Category['scope'] })}>
              <option value="academic">Academic</option>
              <option value="nonAcademic" title="Non-academic subjects count toward study time and appear in the timer, dashboard, routines, and group presence. Use this for structured practice like piano lessons or coding.">General</option>
            </select>
          </div>
          <div>
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editCategory ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Category?">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Delete <span className="font-semibold">{deleteConfirm?.name}</span>? Focus areas in this category will become uncategorized.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={deleteCat} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</Button>
        </div>
      </Modal>
    </div>
  )
}
