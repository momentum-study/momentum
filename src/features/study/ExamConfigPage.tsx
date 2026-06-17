import { useState, useMemo } from 'react'
import { parseISO } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { isoNow } from '../../lib/utils'
import { useUndo } from '../../lib/use-undo'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Link } from 'react-router-dom'
import type { StudyArea } from '../../domain/types'

export default function ExamConfigPage() {
  const { data, loadData } = useData()
  const { push: pushUndo } = useUndo()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkDueDate, setBulkDueDate] = useState('')

  const activeAreas = useMemo(
    () => data.studyAreas.filter((a) => !a.deletedAt),
    [data.studyAreas]
  )

  const subjects = useMemo(() => {
    const map = new Map<string, string>()
    data.subjects.forEach((s) => map.set(s.id, s.name))
    return map
  }, [data.subjects])

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  async function toggleExamMode(area: StudyArea) {
    const now = isoNow()
    const updated: StudyArea = {
      ...area,
      examMode: area.examMode?.enabled
        ? null
        : { enabled: true, dueDate: '' },
      updatedAt: now,
    }
    await db.studyAreas.put(updated)
    pushUndo({
      description: area.examMode?.enabled
        ? `Disabled exam mode for "${area.name}"`
        : `Enabled exam mode for "${area.name}"`,
      undo: async () => { await db.studyAreas.put(area); await loadData() },
      redo: async () => { await db.studyAreas.put(updated); await loadData() },
    })
    await loadData()
  }

  async function setExamDate(area: StudyArea, dueDate: string) {
    if (!dueDate) return
    const now = isoNow()
    const updated: StudyArea = {
      ...area,
      examMode: { enabled: true, dueDate },
      updatedAt: now,
    }
    await db.studyAreas.put(updated)
    pushUndo({
      description: `Set exam date for "${area.name}" to ${dueDate}`,
      undo: async () => { await db.studyAreas.put(area); await loadData() },
      redo: async () => { await db.studyAreas.put(updated); await loadData() },
    })
    await loadData()
  }

  async function applyBulkExamMode() {
    if (!bulkDueDate || selectedIds.size === 0) return
    const now = isoNow()
    for (const id of selectedIds) {
      const area = activeAreas.find((a) => a.id === id)
      if (!area) continue
      const updated: StudyArea = {
        ...area,
        examMode: { enabled: true, dueDate: bulkDueDate },
        updatedAt: now,
      }
      await db.studyAreas.put(updated)
    }
    await loadData()
    setShowBulkModal(false)
    setSelectedIds(new Set())
  }

  const examAreas = activeAreas.filter((a) => a.examMode?.enabled)
  const normalAreas = activeAreas.filter((a) => !a.examMode?.enabled)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Exam Mode</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Accelerate reviews for areas with upcoming exams
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/study">
            <Button variant="secondary">← Back</Button>
          </Link>
          {selectedIds.size > 0 && (
            <Button onClick={() => setShowBulkModal(true)}>
              Set Exam ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Exam areas */}
      {examAreas.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-purple-700 dark:text-purple-300 mb-3">
            📚 Exam Mode Active ({examAreas.length})
          </h2>
          <div className="space-y-3">
            {examAreas.map((area) => {
              const daysLeft = area.examMode?.dueDate
                ? Math.ceil((parseISO(area.examMode.dueDate).getTime() - Date.now()) / 86400000)
                : null
              return (
                <Card key={area.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(area.id)}
                          onChange={() => toggleSelect(area.id)}
                          className="rounded"
                        />
                        <span className="font-medium">{area.name}</span>
                        <span className="text-xs text-slate-500">
                          {subjects.get(area.subjectId)}
                        </span>
                      </div>
                      {daysLeft !== null && (
                        <p className="text-sm text-purple-600 dark:text-purple-400 mt-1 ml-6">
                          {daysLeft > 0
                            ? `${daysLeft} days until exam`
                            : 'Exam passed — consider updating date'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="date"
                        value={area.examMode?.dueDate || ''}
                        onChange={(e) => setExamDate(area, e.target.value)}
                        className="px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-700"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleExamMode(area)}
                      >
                        Disable
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Normal areas */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          All Areas ({normalAreas.length})
        </h2>
        {normalAreas.length === 0 ? (
          <EmptyState
            title="All areas in exam mode"
            description="All study areas have exam mode enabled."
          />
        ) : (
          <div className="space-y-3">
            {normalAreas.map((area) => (
              <Card key={area.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(area.id)}
                      onChange={() => toggleSelect(area.id)}
                      className="rounded"
                    />
                    <span className="font-medium">{area.name}</span>
                    <span className="text-xs text-slate-500">
                      {subjects.get(area.subjectId)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleExamMode(area)}
                  >
                    Enable Exam Mode
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bulk exam modal */}
      <Modal open={showBulkModal} onClose={() => setShowBulkModal(false)} title="Set Exam Date">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Set exam date for {selectedIds.size} selected area{selectedIds.size === 1 ? '' : 's'}.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">Exam Date</label>
            <input
              type="date"
              value={bulkDueDate}
              onChange={(e) => setBulkDueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowBulkModal(false)}>Cancel</Button>
            <Button onClick={applyBulkExamMode} disabled={!bulkDueDate}>Apply</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}