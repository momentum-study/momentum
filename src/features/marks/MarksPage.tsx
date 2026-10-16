import { useMemo, useState, useEffect } from 'react'
import { Checkbox } from '../../components/ui/Checkbox'
import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn, gradeColor, isoNow, pctToGrade, getSubjectPathLabel, getSubjectPickerOptions, isAcademicSubject } from '../../lib/utils'
import { filterActive } from '../../lib/filterActive'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { ContextMenu } from '../../components/ui/ContextMenu'
import { KebabMenu } from '../../components/ui/KebabMenu'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { v4 as uuid } from 'uuid'
import { format } from 'date-fns'
import type { Mark } from '../../domain/types'

interface MarkForm {
  name: string
  subjectId: string
  score: string
  total: string
  averageMark: string
  weight: string
  letterGrade: string
  date: string
  note: string
}

const emptyForm = (): MarkForm => ({
  name: '',
  subjectId: '',
  score: '',
  total: '100',
  averageMark: '',
  weight: '',
  letterGrade: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  note: '',
})

const toForm = (m: Mark): MarkForm => ({
  name: m.name,
  subjectId: m.subjectId,
  score: String(m.score),
  total: String(m.total),
  averageMark: m.averageMark != null ? String(m.averageMark) : '',
  weight: String(m.weight),
  letterGrade: m.letterGrade ?? '',
  date: m.date,
  note: '',
})

const weightedPct = (m: Mark) => (m.total > 0 ? (m.score / m.total) * 100 : 0)

const getGrade = (m: Mark): string => m.letterGrade || pctToGrade(weightedPct(m))

type SortKey = 'name' | 'subject' | 'score' | 'date'
type SortOrder = 'asc' | 'desc'

export default function MarksPage() {
  const { data, isLoading, loadData } = useData()
  const location = useLocation()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Mark | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [form, setForm] = useState<MarkForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterSubjects, setFilterSubjects] = useState<Set<string>>(new Set())
  const [filterName, setFilterName] = useState('')
  const [filterYear, setFilterYear] = useState<'all' | number>('all')
  // Years the user has explicitly started (e.g. next year before any marks
  // exist in it). Persisted so the filter chip survives a reload.
  const [extraYears, setExtraYears] = useState<number[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('momentum-marks-years') ?? '[]')
      return Array.isArray(v) ? v.filter((y) => typeof y === 'number') : []
    } catch {
      return []
    }
  })
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [visibleCount, setVisibleCount] = useState(20)
  const [selectedMarkIds, setSelectedMarkIds] = useState<Set<string>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const subjects = filterActive(data.subjects)
  const categories = filterActive(data.categories)

  const subjectName = (id: string) => getSubjectPathLabel(id, subjects)

  // Marks are academic-only. Non-academic marks are hidden from the page but
  // left untouched in the database (never destroyed by a display decision).
  const academicIds = useMemo(
    () => new Set(subjects.filter((s) => isAcademicSubject(s.id, subjects, categories)).map((s) => s.id)),
    [subjects, categories]
  )
  const academicSubjects = useMemo(
    () => subjects.filter((s) => academicIds.has(s.id)),
    [subjects, academicIds]
  )
  const allMarks = data.marks.filter((m) => !m.deletedAt)
  const hiddenNonAcademicCount = allMarks.filter((m) => !academicIds.has(m.subjectId)).length
  const marks = allMarks.filter((m) => academicIds.has(m.subjectId))

  const subjectOptions = useMemo(
    () => [...academicSubjects].sort((a, b) => a.name.localeCompare(b.name)),
    [academicSubjects]
  )

  // Year filter options: years that have marks, the current year, and any
  // year the user explicitly started. Newest first.
  const years = useMemo(() => {
    const set = new Set<number>(extraYears)
    set.add(new Date().getFullYear())
    for (const m of marks) {
      const y = Number(m.date.slice(0, 4))
      if (Number.isFinite(y)) set.add(y)
    }
    return [...set].sort((a, b) => b - a)
  }, [marks, extraYears])

  const filteredMarks = useMemo(() => {
    let result = [...marks]
    if (filterSubjects.size > 0) {
      result = result.filter((m) => filterSubjects.has(m.subjectId))
    }
    if (filterYear !== 'all') {
      result = result.filter((m) => Number(m.date.slice(0, 4)) === filterYear)
    }
    if (filterName) {
      const q = filterName.toLowerCase()
      result = result.filter((m) => m.name.toLowerCase().includes(q))
    }
    result.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortKey === 'subject') {
        cmp = subjectName(a.subjectId).localeCompare(subjectName(b.subjectId))
      } else if (sortKey === 'score') {
        cmp = weightedPct(a) - weightedPct(b)
      } else {
        cmp = a.date.localeCompare(b.date)
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return result
  }, [marks, filterSubjects, filterYear, filterName, sortKey, sortOrder, subjectName])

  // Per-subject overall result: the weighted percentage across that subject's
  // (filtered) marks, i.e. sum(score/total*weight) / sum(weight), plus grade.
  const subjectSummary = useMemo(() => {
    const acc = new Map<string, { totalWeight: number; weightedScore: number; count: number }>()
    for (const m of filteredMarks) {
      const entry = acc.get(m.subjectId) ?? { totalWeight: 0, weightedScore: 0, count: 0 }
      entry.totalWeight += m.weight
      entry.weightedScore += weightedPct(m) * m.weight
      entry.count += 1
      acc.set(m.subjectId, entry)
    }
    return [...acc.entries()]
      .map(([id, e]) => ({
        id,
        name: subjectName(id),
        count: e.count,
        overall: e.totalWeight > 0 ? e.weightedScore / e.totalWeight : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredMarks, subjectName])

  const visibleMarks = filteredMarks.slice(0, visibleCount)
  const allSubjectsSelected = filterSubjects.size === 0
  function toggleSubjectFilter(subjectId: string) {
    setFilterSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return next
    })
  }
  function clearSubjectFilter() {
    setFilterSubjects(new Set())
  }
  const yearHasMarks = (y: number) => marks.some((m) => Number(m.date.slice(0, 4)) === y)
  function startNewYear() {
    const next = (years[0] ?? new Date().getFullYear()) + 1
    const updated = [...new Set([...extraYears, next])]
    setExtraYears(updated)
    try { localStorage.setItem('momentum-marks-years', JSON.stringify(updated)) } catch { /* ignore */ }
    setFilterYear(next)
  }
  function removeExtraYear(y: number) {
    const updated = extraYears.filter((x) => x !== y)
    setExtraYears(updated)
    try { localStorage.setItem('momentum-marks-years', JSON.stringify(updated)) } catch { /* ignore */ }
    if (filterYear === y) setFilterYear('all')
  }

  // Early return AFTER all hooks
  const confirmDelete = async (id: string) => {
    setDeleting(null)
    await db.marks.update(id, { deletedAt: isoNow(), updatedAt: isoNow() })
    await loadData()
  }
  const deleteMark = confirmDelete
  const openAdd = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }
  const openEdit = (m: Mark) => { setEditing(m); setForm(toForm(m)); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditing(null) }
  // M1 fix: FAB navigates here with { state: { openAdd: true } } — open the
  // add modal on mount and clear the flag so it doesn't re-open on back-nav.
  useEffect(() => {
    if (location.state?.openAdd) {
      openAdd()
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // N — Add new mark
  useEffect(() => {
    function onAdd() { openAdd() }
    window.addEventListener('momentum:marks-add', onAdd)
    return () => window.removeEventListener('momentum:marks-add', onAdd)
  }, [])
  // Del — Delete selected mark
  useEffect(() => {
    function onDelete() {
      const mark = filteredMarks[selectedIndex]
      if (mark) deleteMark(mark.id)
    }
    window.addEventListener('momentum:marks-delete', onDelete)
    return () => window.removeEventListener('momentum:marks-delete', onDelete)
  }, [selectedIndex, filteredMarks])
  // ↑ / ↓ — Navigate list
  useEffect(() => {
    function onPrev() { setSelectedIndex(i => Math.max(0, i - 1)) }
    function onNext() { setSelectedIndex(i => Math.min(filteredMarks.length - 1, i + 1)) }
    window.addEventListener('momentum:marks-prev', onPrev)
    window.addEventListener('momentum:marks-next', onNext)
    return () => {
      window.removeEventListener('momentum:marks-prev', onPrev)
      window.removeEventListener('momentum:marks-next', onNext)
    }
  }, [filteredMarks.length])
  // Enter — Edit selected mark
  useEffect(() => {
    function onEdit() {
      const mark = filteredMarks[selectedIndex]
      if (mark) openEdit(mark)
    }
    window.addEventListener('momentum:marks-edit', onEdit)
    return () => window.removeEventListener('momentum:marks-edit', onEdit)
  }, [selectedIndex, filteredMarks])
  // Early return AFTER all hooks
  if (isLoading) return <PageSpinner />

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
  }


  const updateField = <K extends keyof MarkForm>(k: K, v: MarkForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    const name = form.name.trim()
    const subjectId = form.subjectId
    const score = Number(form.score)
    const total = Number(form.total) || 100
    const weight = Number(form.weight)
    const letterGrade = form.letterGrade.trim() || null
    const date = form.date
    const averageMarkRaw = form.averageMark.trim()
    const averageMark = averageMarkRaw === '' ? null : Number(averageMarkRaw)
    if (
      !name || !subjectId || isNaN(score) || isNaN(total) || isNaN(weight) ||
      weight < 0 || weight > 100 || !date
    ) return
    if (averageMark != null && isNaN(averageMark)) return

    setSaving(true)
    const now = isoNow()
    if (editing) {
      await db.marks.update(editing.id, { name, subjectId, score, total, averageMark, weight, letterGrade, date, updatedAt: now })
    } else {
      await db.marks.add({ id: uuid(), name, subjectId, score, total, averageMark, weight, letterGrade, date, createdAt: now, updatedAt: now, deletedAt: null })
    }
    await loadData()
    setSaving(false)
    closeModal()
  }


  const formValid =
    form.name.trim() !== '' &&
    form.subjectId !== '' &&
    !isNaN(Number(form.score)) &&
    !isNaN(Number(form.total)) &&
    !isNaN(Number(form.weight)) &&
    Number(form.weight) >= 0 &&
    Number(form.weight) <= 100 &&
    form.date !== '' &&
    (form.averageMark.trim() === '' || !isNaN(Number(form.averageMark)))

  const SortIcon = ({ column }: { column: SortKey }) => (
    <span className="ml-1 text-xs">{sortKey === column ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</span>
  )
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Marks</h2>
        <div className="flex gap-2">
          {selectedMarkIds.size > 1 && (
            <Button variant="secondary" size="sm" onClick={() => setCompareOpen(true)}>
              Compare {selectedMarkIds.size} marks
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={openAdd}>Add Mark</Button>
        </div>
      </div>
      {/* Filters */}
      {marks.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearSubjectFilter}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                allSubjectsSelected
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
            >
              All subjects
            </button>
            {subjectOptions.map((s) => {
              const active = filterSubjects.has(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSubjectFilter(s.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  )}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => setFilterYear('all')}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filterYear === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              )}
            >
              All years
            </button>
            {years.map((y) => {
              const active = filterYear === y
              const removable = !yearHasMarks(y) && extraYears.includes(y)
              return (
                <span key={y} className="relative inline-flex">
                  <button
                    type="button"
                    onClick={() => setFilterYear(y)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    )}
                  >
                    {y}
                  </button>
                  {removable && (
                    <button
                      type="button"
                      aria-label={`Remove ${y}`}
                      onClick={() => removeExtraYear(y)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </span>
              )
            })}
            <button
              type="button"
              onClick={startNewYear}
              className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
            >
              + New year
            </button>
          </div>
          <input className="input text-sm" placeholder="Filter by name..." value={filterName} onChange={(e) => setFilterName(e.target.value)} />
          {hiddenNonAcademicCount > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hiddenNonAcademicCount} mark{hiddenNonAcademicCount !== 1 ? 's' : ''} on non-academic focus areas hidden.
            </p>
          )}
        </div>
      )}

      {/* Subject summary — overall weighted % per focus area */}
      {subjectSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject summary</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Focus area</th>
                  <th className="pb-2 pr-4 font-medium">Marks</th>
                  <th className="pb-2 pr-4 font-medium">Overall (weighted)</th>
                  <th className="pb-2 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {subjectSummary.map((s) => {
                  const grade = pctToGrade(Math.round(s.overall))
                  return (
                    <tr key={s.id} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-100">{s.name}</td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{s.count}</td>
                      <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-100">{s.overall.toFixed(1)}%</td>
                      <td className={cn('py-2.5 font-medium', gradeColor(grade))}>{grade}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {/* Mark list */}
      {marks.length === 0 ? (
        <EmptyState
          title="No marks yet"
          description="Add a mark to start tracking your academic results."
          action={<Button variant="primary" size="sm" onClick={openAdd}>Add Mark</Button>}
        />
      ) : filteredMarks.length === 0 ? (
        <EmptyState title="No matches" description="Try adjusting your filters." />
      ) : (<>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                <th className="pb-2 pr-2 w-8">
                  <Checkbox
                    aria-label="Select all visible"
                    checked={visibleMarks.length > 0 && visibleMarks.every((m) => selectedMarkIds.has(m.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMarkIds(new Set(visibleMarks.map((m) => m.id)))
                      } else {
                        setSelectedMarkIds(new Set())
                      }
                    }}
                  />
                </th>
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('name')}>Name<SortIcon column="name" /></th>
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('subject')}>Subject<SortIcon column="subject" /></th>
                <th className="pb-2 pr-4 font-medium">Score</th>
                <th className="pb-2 pr-4 font-medium">Weight</th>
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('score')}>%<SortIcon column="score" /></th>
                <th className="pb-2 pr-4 font-medium">Grade</th>
                <th className="pb-2 pr-4 font-medium">Grade Average</th>
                <th className="pb-2 pr-4 font-medium">Avg %</th>
                <th className="pb-2 pr-4 font-medium">Avg Grade</th>
                <th className="pb-2 pr-4 font-medium cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" onClick={() => toggleSort('date')}>Date<SortIcon column="date" /></th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibleMarks.map((m) => {
                const pct = weightedPct(m)
                const grade = getGrade(m)
                const pctColor = pct >= 80 ? 'text-green-600 dark:text-green-400' : pct >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                const hasAvg = m.averageMark != null
                const avgPct = hasAvg ? (m.total > 0 ? (m.averageMark! / m.total) * 100 : 0) : null
                const avgGrade = avgPct != null ? pctToGrade(avgPct) : null
                const vsAvg = hasAvg ? pct - (avgPct as number) : null
                return (
                  <ContextMenu key={m.id} items={[
                    { label: 'Edit', action: () => openEdit(m) },
                    { label: 'Delete', action: () => setDeleting(m.id), danger: true },
                  ]}>
                    <tr className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="py-2.5 pr-2">
                        <Checkbox
                          checked={selectedMarkIds.has(m.id)}
                          onChange={() => setSelectedMarkIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(m.id)) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })}
                        />
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-100">{m.name}</td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{subjectName(m.subjectId)}</td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{m.score}/{m.total}</td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{m.weight}%</td>
                      <td className={cn('py-2.5 pr-4 font-medium', pctColor)}>{pct.toFixed(1)}%</td>
                      <td className={cn('py-2.5 pr-4 font-medium', gradeColor(grade))}>{grade}</td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{hasAvg ? m.averageMark!.toFixed(1) : '—'}</td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                        {avgPct != null ? (
                          <span>
                            {avgPct.toFixed(1)}%
                            {vsAvg != null && (
                              <span className={cn('ml-1 text-xs font-medium', vsAvg >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                                {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(1)}
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={cn('py-2.5 pr-4 font-medium', avgGrade ? gradeColor(avgGrade) : '')}>{avgGrade ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">{m.date}</td>
                      <td className="py-2.5 whitespace-nowrap text-right">
                        <KebabMenu
                          ariaLabel={`Actions for ${m.name}`}
                          items={[
                            { label: 'Edit', action: () => openEdit(m) },
                            { label: 'Delete', action: () => setDeleting(m.id), danger: true },
                          ]}
                        />
                      </td>
                    </tr>
                  </ContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredMarks.length > visibleCount && (
          <div className="flex justify-center pt-2">
            <Button variant="secondary" size="sm" onClick={() => setVisibleCount((n) => n + 20)}>
              Load more
            </Button>
          </div>
        )}
      </>)}

      {/* Delete confirmation */}
      {deleting && (
        <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Mark">
          <p className="mb-4 text-slate-600 dark:text-slate-300">Are you sure you want to delete this mark? This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => confirmDelete(deleting)}>Delete</Button>
          </div>
        </Modal>
      )}

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Mark' : 'Add Mark'}>
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="mark-name">Name</label>
            <input id="mark-name" className="input" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g. Midterm" />
          </div>
          <div>
            <label className="label" htmlFor="mark-subject">Subject</label>
            <select id="mark-subject" className="input" value={form.subjectId} onChange={(e) => updateField('subjectId', e.target.value)}>
              <option value="">Select subject</option>
              {getSubjectPickerOptions(academicSubjects).map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="mark-score">Score</label>
              <input id="mark-score" className="input" type="number" value={form.score} onChange={(e) => updateField('score', e.target.value)} placeholder="85" />
            </div>
            <div>
              <label className="label" htmlFor="mark-total">Total</label>
              <input id="mark-total" className="input" type="number" value={form.total} onChange={(e) => updateField('total', e.target.value)} placeholder="100" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mark-weight">Weight (%)</label>
            <input id="mark-weight" className="input" type="number" min="0" max="100" value={form.weight} onChange={(e) => updateField('weight', e.target.value)} placeholder="20" />
          </div>
          <div>
            <label className="label" htmlFor="mark-average">Grade Average (optional)</label>
            <input id="mark-average" className="input" type="number" value={form.averageMark} onChange={(e) => updateField('averageMark', e.target.value)} placeholder="e.g. 72" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used to compare your mark against the grade average (e.g. cohort average).</p>
          </div>
          <div>
            <label className="label" htmlFor="mark-date">Date</label>
            <input id="mark-date" className="input" type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!formValid || saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Add'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title={`Compare ${selectedMarkIds.size} marks`} className="max-w-2xl">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Subject</th>
                <th className="pb-2 pr-4 font-medium">%</th>
                <th className="pb-2 pr-4 font-medium">Grade</th>
                <th className="pb-2 pr-4 font-medium">Weight</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.marks.filter(m => selectedMarkIds.has(m.id)).map(m => {
                const pct = weightedPct(m)
                const grade = getGrade(m)
                return (
                  <tr key={m.id} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">{m.name}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{subjectName(m.subjectId)}</td>
                    <td className={cn('py-2 pr-4 font-medium', pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600')}>{pct.toFixed(1)}%</td>
                    <td className={cn('py-2 pr-4 font-medium', gradeColor(grade))}>{grade}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{m.weight}%</td>
                    <td className="py-2 pr-4 text-slate-500">{m.date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(() => {
            const selectedMarks = data.marks.filter(m => selectedMarkIds.has(m.id))
            const totalWeight = selectedMarks.reduce((sum, m) => sum + m.weight, 0)
            const weightedAvg = totalWeight > 0
              ? selectedMarks.reduce((sum, m) => sum + weightedPct(m) * m.weight, 0) / totalWeight
              : 0
            return (
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-100">
                Weighted average: {weightedAvg.toFixed(1)}% <span className={cn('ml-2', gradeColor(pctToGrade(weightedAvg)))}>({pctToGrade(weightedAvg)})</span>
                <span className="ml-2 text-xs font-normal text-slate-500">across {selectedMarks.length} marks</span>
              </div>
            )
          })()}
        </div>
      </Modal>

    </div>
  )
}
