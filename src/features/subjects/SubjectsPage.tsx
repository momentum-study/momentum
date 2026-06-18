import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Link } from 'react-router-dom'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn, isoNow } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { ColorPicker } from '../../components/ui/ColorPicker'
import type { Subject } from '../../domain/types'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_COLOR = '#6366f1'

interface SubjectFormData {
  name: string
  categoryId: string
  color: string
  routine: number[]
  weeklyTargetMinutes: number
}

const emptyFormData: SubjectFormData = {
  name: '',
  categoryId: '',
  color: DEFAULT_COLOR,
  routine: [],
  weeklyTargetMinutes: 60,
}

export default function SubjectsPage() {
  const { data, isLoading, loadData } = useData()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [deleteSubject, setDeleteSubject] = useState<Subject | null>(null)
  const [formData, setFormData] = useState<SubjectFormData>(emptyFormData)
  const [isSaving, setIsSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')

  const handleOpenModal = (subject?: Subject) => {
    if (subject) {
      setEditingSubject(subject)
      setFormData({
        name: subject.name,
        categoryId: subject.categoryId,
        color: subject.color || DEFAULT_COLOR,
        routine: subject.routine || [],
        weeklyTargetMinutes: subject.weeklyTargetMinutes || 60,
      })
    } else {
      setEditingSubject(null)
      setFormData({
        ...emptyFormData,
        categoryId: data.categories[0]?.id || '',
      })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingSubject(null)
    setFormData(emptyFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.categoryId) return

    setIsSaving(true)
    try {
      const now = isoNow()
      if (editingSubject) {
        await db.subjects.update(editingSubject.id, {
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          color: formData.color,
          routine: formData.routine,
          weeklyTargetMinutes: formData.weeklyTargetMinutes,
          updatedAt: now,
        })
      } else {
        const newSubject: Subject = {
          id: uuid(),
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          color: formData.color,
          routine: formData.routine,
          weeklyTargetMinutes: formData.weeklyTargetMinutes,
          createdAt: now,
          updatedAt: now,
        }
        await db.subjects.add(newSubject)
      }
      await loadData()
      handleCloseModal()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteSubject) return
    setIsSaving(true)
    try {
      const now = isoNow()
      const subjId = deleteSubject.id
      // Soft-delete the subject and cascade to its projects, sessions, and assignments
      // so consumers that filter by !deletedAt don't see dangling references.
      await db.subjects.update(subjId, { deletedAt: now, updatedAt: now })
      const projectsToSoft = await db.projects.where('subjectId').equals(subjId).toArray()
      for (const p of projectsToSoft) {
        await db.projects.update(p.id, { deletedAt: now, updatedAt: now })
      }
      const sessionsToSoft = await db.sessions.where('subjectId').equals(subjId).toArray()
      for (const s of sessionsToSoft) {
        await db.sessions.update(s.id, { deletedAt: now, updatedAt: now })
      }
      const assignmentsToSoft = await db.assignments.where('subjectId').equals(subjId).toArray()
      for (const a of assignmentsToSoft) {
        await db.assignments.update(a.id, { deletedAt: now, updatedAt: now })
      }
      await loadData()
      setDeleteSubject(null)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleRoutineDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      routine: prev.routine.includes(day)
        ? prev.routine.filter((d) => d !== day)
        : [...prev.routine, day].sort(),
    }))
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Focus Areas</h2>
        <div className="flex gap-2">
          <Link to="/categories" className="btn-secondary text-sm">Manage Categories</Link>
          <Button variant="primary" size="sm" onClick={() => handleOpenModal()}>
            Add Focus Area
          </Button>
        </div>
      </div>

      {data.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              filterCategory === ''
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            )}
            onClick={() => setFilterCategory('')}
          >
            All
          </button>
          {data.categories.map((cat) => (
            <button
              key={cat.id}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                filterCategory === cat.id
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              )}
              onClick={() => setFilterCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {data.categories.length === 0 && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          No categories yet. <Link to="/categories" className="font-medium underline">Create a category</Link> first so you can assign focus areas.
        </div>
      )}

      {data.subjects.length === 0 ? (
        <EmptyState
          title="No focus areas yet"
          description="Add a focus area to start tracking your study time."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.subjects.filter((s) => !filterCategory || s.categoryId === filterCategory).map((subject) => (
            <Card key={subject.id}>
              <div className="flex items-start gap-3">
                <div
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: subject.color || DEFAULT_COLOR }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {subject.name}
                  </div>
                  <div className="text-sm text-slate-500">
                    {data.categories.find((c) => c.id === subject.categoryId)?.name ?? 'Uncategorized'}
                  </div>
                  {subject.routine && subject.routine.length > 0 && (
                    <div className="mt-1 text-xs text-slate-400">
                      {subject.routine.map((d) => DAYS_OF_WEEK[d]).join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="secondary" size="sm" onClick={() => handleOpenModal(subject)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteSubject(subject)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={isModalOpen} onClose={handleCloseModal} title={editingSubject ? 'Edit Focus Area' : 'Add Focus Area'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              className="input w-full"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Focus area name"
              required
            />
          </div>

          <div>
            <label className="label">Category</label>
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={formData.categoryId}
                onChange={(e) => setFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
                required
              >
                <option value="">Select category</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <Link to="/categories" className="btn-secondary text-xs">+ New</Link>
            </div>
          </div>

          <div>
            <label className="label">Colour</label>
            <ColorPicker value={formData.color} onChange={(c) => setFormData((prev) => ({ ...prev, color: c }))} />
          </div>

          <div>
            <label className="label">Routine</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    'rounded px-3 py-1 text-sm transition-colors',
                    formData.routine.includes(index)
                      ? 'bg-slate-600 text-white dark:bg-slate-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  )}
                  onClick={() => toggleRoutineDay(index)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Weekly Target (minutes)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="input w-full"
              value={formData.weeklyTargetMinutes === 0 ? '' : String(formData.weeklyTargetMinutes)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') { setFormData((prev) => ({ ...prev, weeklyTargetMinutes: 0 })); return; }
                const n = Number(v);
                if (isNaN(n)) return;
                setFormData((prev) => ({ ...prev, weeklyTargetMinutes: n }));
              }}
              step="15"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingSubject ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteSubject}
        onClose={() => setDeleteSubject(null)}
        title="Delete Focus Area"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {deleteSubject?.name}
            </span>
            ? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteSubject(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
