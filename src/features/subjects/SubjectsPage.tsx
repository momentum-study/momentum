import { useMemo, useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn, isoNow, isTopLevelSubject, getChildSubjects, formatMinutes, toLocalDateString } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ContextMenu } from '../../components/ui/ContextMenu'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { ColorPicker, COLOR_NAMES } from '../../components/ui/ColorPicker'
import { useUndo } from '../../lib/use-undo'
import { sessionLocalDate } from '../../lib/utils'
import { recomputeStreakDaysForDates } from '../../lib/routine-tracker'
import type { Subject, Category } from '../../domain/types'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_COLOR = '#6366f1'
/** Tooltip text for a subject's color dot: preset name, or hex, or fallback. */
function colorName(hex: string): string {
  return COLOR_NAMES[hex] ?? (hex || 'Color')
}

interface SubjectFormData {
  name: string
  categoryId: string
  color: string
  parentSubjectId: string
  routine: number[]
  weeklyTargetMinutes: number
}

const emptyFormData: SubjectFormData = {
  name: '',
  categoryId: '',
  color: DEFAULT_COLOR,
  parentSubjectId: '',
  routine: [],
  weeklyTargetMinutes: 60,
}

export default function SubjectsPage() {
  const { data, isLoading, loadData } = useData()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { push: pushUndo } = useUndo()
  const location = useLocation()
  const navigate = useNavigate()
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [deleteSubject, setDeleteSubject] = useState<Subject | null>(null)
  const [formData, setFormData] = useState<SubjectFormData>(emptyFormData)
  const [isSaving, setIsSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [showCategoriesModal, setShowCategoriesModal] = useState(false)
  const [catForm, setCatForm] = useState<{ name: string; scope: Category['scope']; color: string }>({ name: '', scope: 'academic', color: DEFAULT_COLOR })
  const [catSaving, setCatSaving] = useState(false)
  const [catDeleteConfirm, setCatDeleteConfirm] = useState<Category | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const activeSubjects = data.subjects.filter((s) => !s.deletedAt)
  const topLevelSubjects = activeSubjects
    .filter((s) => isTopLevelSubject(s) && (!filterCategory || s.categoryId === filterCategory))
    .sort((a, b) => a.name.localeCompare(b.name))
  const activeCategories = data.categories.filter((c) => !c.deletedAt)
  // Per-subject summary: today, week, total minutes + child IDs (for compact child list)
  const subjectStats = useMemo(() => {
    const map: Record<string, { today: number; week: number; total: number; childIds: string[] }> = {}
    const todayStr = toLocalDateString(new Date().toISOString())
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    // Seed all active top-level subjects
    for (const s of activeSubjects) map[s.id] = { today: 0, week: 0, total: 0, childIds: [] }
    // Collect child IDs
    for (const s of activeSubjects) {
      if (s.parentSubjectId && map[s.parentSubjectId]) {
        map[s.parentSubjectId].childIds.push(s.id)
      }
    }
    const allIds = new Set(Object.keys(map))
    for (const s of data.sessions) {
      if (s.deletedAt || !allIds.has(s.subjectId)) continue
      const ds = toLocalDateString(s.startAt)
      const entry = map[s.subjectId]
      entry.total += s.durationMinutes
      if (ds === todayStr) entry.today += s.durationMinutes
      if (new Date(s.startAt) >= weekAgo) entry.week += s.durationMinutes
    }
    return map
  }, [activeSubjects, data.sessions])

  const handleOpenModal = (subject: Subject | null = null) => {
    if (subject) {
      setEditingSubject(subject)
      setFormData({
        name: subject.name,
        categoryId: subject.categoryId,
        color: subject.color || DEFAULT_COLOR,
        parentSubjectId: subject.parentSubjectId ?? '',
        routine: subject.routine || [],
        weeklyTargetMinutes: subject.weeklyTargetMinutes || 60,
      })
    } else {
      setEditingSubject(null)
      setFormData({
        ...emptyFormData,
        categoryId: activeCategories[0]?.id || '',
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
      const parentId = formData.parentSubjectId || null
      if (editingSubject) {
        await db.subjects.update(editingSubject.id, {
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          color: formData.color,
          parentSubjectId: parentId,
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
          parentSubjectId: parentId,
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
      const deletedAt = now
      const updatedAt = now
      const originalSubject = deleteSubject

      // Collect all descendant child subjects recursively
      const allChildIds: string[] = []
      function collectChildren(parentId: string) {
        for (const s of data.subjects) {
          if (!s.deletedAt && s.parentSubjectId === parentId) {
            allChildIds.push(s.id)
            collectChildren(s.id)
          }
        }
      }
      collectChildren(subjId)


      // Cascade in a single transaction for atomicity + performance (L11).
      const allSubjectIds = [subjId, ...allChildIds]
      // Read affected records BEFORE entering the transaction so we can
      // capture their pre-delete state for the undo handler.
      const prevProjects = await db.projects.where('subjectId').anyOf(allSubjectIds).toArray()
      const prevSessions = await db.sessions.where('subjectId').anyOf(allSubjectIds).toArray()
      const prevAssignments = await db.assignments.where('subjectId').anyOf(allSubjectIds).toArray()
      await db.transaction(
        'rw',
        [db.subjects, db.projects, db.sessions, db.assignments],
        async () => {
          await db.subjects.update(subjId, { deletedAt, updatedAt })
          for (const childId of allChildIds) {
            await db.subjects.update(childId, { deletedAt, updatedAt })
          }
          for (const p of prevProjects) {
            await db.projects.update(p.id, { deletedAt, updatedAt })
          }
          for (const s of prevSessions) {
            await db.sessions.update(s.id, { deletedAt, updatedAt })
          }
          for (const a of prevAssignments) {
            await db.assignments.update(a.id, { deletedAt, updatedAt })
          }
        }
      )
      // Recompute streak days for every date that had a cascaded session, so
      // the now-deleted minutes stop counting toward the daily goal (H6).
      const affectedDates = new Set(prevSessions.map(s => sessionLocalDate(s.startAt)))
      await recomputeStreakDaysForDates(Array.from(affectedDates))
      await loadData()
      setDeleteSubject(null)
      const totalItems = allChildIds.length + prevProjects.length + prevSessions.length + prevAssignments.length
      pushUndo({
        description: originalSubject
          ? `Deleted focus area "${originalSubject.name}" and ${totalItems} related items`
          : `Deleted focus area`,
        undo: async () => {
          // L11 fix: wrap cross-table restore in a single transaction.
          await db.transaction(
            'rw',
            [db.subjects, db.projects, db.sessions, db.assignments],
            async () => {
              // Restore children first, then parent
              for (const childId of allChildIds) {
                await db.subjects.update(childId, { deletedAt: null, updatedAt: isoNow() })
              }
              await db.subjects.update(subjId, { deletedAt: null, updatedAt: isoNow() })
              for (const p of prevProjects) await db.projects.update(p.id, { deletedAt: null, updatedAt: isoNow() })
              for (const s of prevSessions) await db.sessions.update(s.id, { deletedAt: null, updatedAt: isoNow() })
              for (const a of prevAssignments) await db.assignments.update(a.id, { deletedAt: null, updatedAt: isoNow() })
            }
          )
          await loadData()
        },
        redo: async () => {
          const redoNow = isoNow()
          // L11 fix: same transaction for redo.
          await db.transaction(
            'rw',
            [db.subjects, db.projects, db.sessions, db.assignments],
            async () => {
              await db.subjects.update(subjId, { deletedAt: redoNow, updatedAt: redoNow })
              for (const childId of allChildIds) {
                await db.subjects.update(childId, { deletedAt: redoNow, updatedAt: redoNow })
              }
              for (const p of prevProjects) await db.projects.update(p.id, { deletedAt: redoNow, updatedAt: redoNow })
              for (const s of prevSessions) await db.sessions.update(s.id, { deletedAt: redoNow, updatedAt: redoNow })
              for (const a of prevAssignments) await db.assignments.update(a.id, { deletedAt: redoNow, updatedAt: redoNow })
            }
          )
          await loadData()
        },
      })
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
  async function saveCategory() {
    if (!catForm.name.trim()) return
    setCatSaving(true)
    try {
      const now = isoNow()
      const newCat: Category = {
        id: uuid(),
        name: catForm.name.trim(),
        scope: catForm.scope,
        color: catForm.color,
        createdAt: now,
        updatedAt: now,
      }
      await db.categories.add(newCat)
      await loadData()
      setCatForm({ name: '', scope: 'academic', color: DEFAULT_COLOR })
    } finally {
      setCatSaving(false)
    }
  }

  async function deleteCategory(cat: Category) {
    setCatSaving(true)
    try {
      const now = isoNow()
      // Cascade soft-delete to subjects, projects, sessions, assignments,
      // routineLogs, activityLogs in a single transaction (H4, H6).
      const subjects = await db.subjects.where('categoryId').equals(cat.id).toArray()
      const subjectIds = subjects.map((s) => s.id)
      const projects = await db.projects.where('subjectId').anyOf(subjectIds).toArray()
      const sessions = await db.sessions.where('subjectId').anyOf(subjectIds).toArray()
      const assignments = await db.assignments.where('subjectId').anyOf(subjectIds).toArray()
      await db.transaction(
        'rw',
        [db.categories, db.subjects, db.projects, db.sessions, db.assignments],
        async () => {
          await db.categories.update(cat.id, { deletedAt: now, updatedAt: now })
          for (const s of subjects) await db.subjects.update(s.id, { deletedAt: now, updatedAt: now })
          for (const p of projects) await db.projects.update(p.id, { deletedAt: now, updatedAt: now })
          for (const s of sessions) await db.sessions.update(s.id, { deletedAt: now, updatedAt: now })
          for (const a of assignments) await db.assignments.update(a.id, { deletedAt: now, updatedAt: now })
        }
      )
      const affectedDates = new Set(sessions.map((s) => sessionLocalDate(s.startAt)))
      await recomputeStreakDaysForDates(Array.from(affectedDates))
      await loadData()
      setCatDeleteConfirm(null)
    } finally {
      setCatSaving(false)
    }
  }

  // Keyboard shortcuts for subject management
  useEffect(() => {
    function onAdd() { handleOpenModal(null) }
    window.addEventListener('momentum:subjects-add', onAdd)
    return () => window.removeEventListener('momentum:subjects-add', onAdd)
  }, [])
  // M1 fix: FAB navigates here with { state: { openAdd: true } } — open the
  // add modal on mount and clear the flag.
  useEffect(() => {
    if (location.state?.openAdd) {
      handleOpenModal(null)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  useEffect(() => {
    function onEdit() {
      const subs = topLevelSubjects
      if (subs[selectedIndex]) handleOpenModal(subs[selectedIndex])
    }
    window.addEventListener('momentum:subjects-edit', onEdit)
    return () => window.removeEventListener('momentum:subjects-edit', onEdit)
  }, [selectedIndex, topLevelSubjects])
  
  useEffect(() => {
    function onDelete() {
      const subs = topLevelSubjects
      if (subs[selectedIndex]) {
        setDeleteSubject(subs[selectedIndex])
      }
    }
    window.addEventListener('momentum:subjects-delete', onDelete)
    return () => window.removeEventListener('momentum:subjects-delete', onDelete)
  }, [selectedIndex, topLevelSubjects])
  
  useEffect(() => {
    function onPrev() { setSelectedIndex(i => Math.max(0, i - 1)) }
    function onNext() { setSelectedIndex(i => Math.min(topLevelSubjects.length - 1, i + 1)) }
    window.addEventListener('momentum:subjects-prev', onPrev)
    window.addEventListener('momentum:subjects-next', onNext)
    return () => {
      window.removeEventListener('momentum:subjects-prev', onPrev)
      window.removeEventListener('momentum:subjects-next', onNext)
    }
  }, [topLevelSubjects.length])
  
  useEffect(() => {
    function onOpen() {
      const subs = topLevelSubjects
      if (subs[selectedIndex]) handleOpenModal(subs[selectedIndex])
    }
    window.addEventListener('momentum:subjects-open', onOpen)
    return () => window.removeEventListener('momentum:subjects-open', onOpen)
  }, [selectedIndex, topLevelSubjects])

  if (isLoading) return <PageSpinner />

  return (
    <div data-tour="subjects" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Focus Areas</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowCategoriesModal(true)}>Manage Categories</Button>
          <Button variant="primary" size="sm" onClick={() => handleOpenModal()}>
            Add Focus Area
          </Button>
        </div>
      </div>

      {activeCategories.length > 0 && (
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
          {activeCategories.map((cat) => (
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

      {activeCategories.length === 0 && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          No categories yet.{' '}
          <button onClick={() => setShowCategoriesModal(true)} className="font-medium underline">Create a category</button>{' '}
          first so you can assign focus areas.
        </div>
      )}

      {activeSubjects.length === 0 ? (
        <EmptyState
          title="No focus areas yet"
          description="Add a focus area to start tracking your study time."
        />
      ) : (
        <div className="space-y-3">
          {topLevelSubjects.map((subject) => {
            const stats = subjectStats[subject.id]
            const children = getChildSubjects(subject.id, activeSubjects)
              .filter((s) => !filterCategory || s.categoryId === filterCategory)
              .sort((a, b) => a.name.localeCompare(b.name))
            return (
              <div key={subject.id} className="space-y-1.5">
                <ContextMenu items={[
                  { label: 'View', action: () => navigate(`/subjects/${subject.id}`) },
                  { label: 'Edit', action: () => handleOpenModal(subject) },
                  { label: 'Delete', action: () => setDeleteSubject(subject), danger: true },
                ]}>
                  <Card className="!p-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/subjects/${subject.id}`)}
                      className="flex w-full items-center gap-2.5 text-left"
                    >
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        title={colorName(subject.color || DEFAULT_COLOR)}
                        style={{ backgroundColor: subject.color || DEFAULT_COLOR }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                            {subject.name}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">
                            {data.categories.find((c) => c.id === subject.categoryId)?.name ?? 'Uncategorized'}
                          </span>
                        </div>
                        {subject.routine && subject.routine.length > 0 && (
                          <div className="text-[11px] text-slate-400">
                            {subject.routine.map((d) => DAYS_OF_WEEK[d]).join(', ')}
                          </div>
                        )}
                      </div>
                      {stats && (
                        <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700 dark:text-slate-300">
                            {formatMinutes(stats.today)}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700 dark:text-slate-300">
                            {formatMinutes(stats.week)}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700 dark:text-slate-300">
                            {formatMinutes(stats.total)}
                          </span>
                          {stats.childIds.length > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700 dark:text-slate-300">
                              {stats.childIds.length} sub
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(subject)} aria-label={`Edit ${subject.name}`}>✎</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteSubject(subject)} aria-label={`Delete ${subject.name}`}>🗑</Button>
                      </div>
                    </button>
                  </Card>
                </ContextMenu>
                {children.length > 0 && (
                  <div className="ml-5 space-y-px">
                    {children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => navigate(`/subjects/${child.id}`)}
                        className="flex w-full items-center gap-1.5 rounded border border-dashed border-slate-200 px-2 py-1 text-xs text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                      >
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          title={colorName(child.color || DEFAULT_COLOR)}
                          style={{ backgroundColor: child.color || DEFAULT_COLOR }}
                        />
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">{child.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-400">
                          {formatMinutes(subjectStats[child.id]?.total ?? 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => { handleCloseModal(); setShowCategoriesModal(true) }} className="btn-secondary text-xs">+ New</button>
            </div>
          </div>

          <div>
            <label className="label">Parent subject</label>
            <select
              className="input w-full"
              value={formData.parentSubjectId}
              onChange={(e) => setFormData((prev) => ({ ...prev, parentSubjectId: e.target.value }))}
            >
              <option value="">Top-level subject</option>
              {activeSubjects
                .filter((subject) => isTopLevelSubject(subject) && subject.id !== editingSubject?.id)
                .map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Leave empty to create a top-level focus area.
            </p>
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

      {/* Manage Categories Modal (formerly a separate /categories page) */}
      <Modal open={showCategoriesModal} onClose={() => setShowCategoriesModal(false)} title="Manage Categories" className="max-w-xl">
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 max-h-64 overflow-y-auto">
            {activeCategories.length === 0 && (
              <p className="text-sm text-slate-500 p-3">No categories yet. Add one below.</p>
            )}
            {activeCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2 p-2">
                <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{cat.name}</span>
                <span className="text-xs text-slate-400">{cat.scope === 'academic' ? 'Academic' : 'General'}</span>
                <Button size="sm" variant="danger" onClick={() => setCatDeleteConfirm(cat)}>Delete</Button>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700 space-y-3">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">Add category</h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Name"
                className="input col-span-2"
                value={catForm.name}
                onChange={(e) => setCatForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <select
                className="input"
                value={catForm.scope}
                onChange={(e) => setCatForm((prev) => ({ ...prev, scope: e.target.value as Category['scope'] }))}
              >
                <option value="academic">Academic</option>
                <option value="nonAcademic">General</option>
              </select>
            </div>
            <ColorPicker value={catForm.color} onChange={(c) => setCatForm((prev) => ({ ...prev, color: c }))} />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={saveCategory} disabled={catSaving || !catForm.name.trim()}>
                {catSaving ? 'Adding…' : 'Add Category'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!catDeleteConfirm} onClose={() => setCatDeleteConfirm(null)} title="Delete Category">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete <span className="font-semibold">{catDeleteConfirm?.name}</span>?
            All focus areas in this category and their sessions will be soft-deleted (and recoverable via Undo).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCatDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => catDeleteConfirm && deleteCategory(catDeleteConfirm)} disabled={catSaving}>
              {catSaving ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
