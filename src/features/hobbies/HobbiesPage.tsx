import { useState, useMemo } from 'react'
import { v4 as uuid } from 'uuid'
import { useData } from '../../app/providers'
import { useUndo } from '../../lib/use-undo'
import { db } from '../../db/app-db'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { cn, isoNow, formatMinutes } from '../../lib/utils'
import { HOBBY_CATEGORIES, hobbySkillLevel, type Hobby, type HobbyCategory, type HobbySession } from '../../domain/types'
import { format, subDays } from 'date-fns'

export default function HobbiesPage() {
  const { data, loadData } = useData()
  const { push } = useUndo()
  const [filter, setFilter] = useState<string>('')
  const [isHobbyModalOpen, setIsHobbyModalOpen] = useState(false)
  const [editingHobby, setEditingHobby] = useState<Hobby | null>(null)
  const [detailHobby, setDetailHobby] = useState<Hobby | null>(null)
  const [logHobbyId, setLogHobbyId] = useState<string | null>(null)
  const [hobbyFormData, setHobbyFormData] = useState({ name: '', category: 'creative' as HobbyCategory, color: '#a855f7', skillLevel: 0, targetHours: 0, notes: '' })
  const [sessionFormData, setSessionFormData] = useState({ duration: 30, note: '' })
  const [detailSkillLevel, setDetailSkillLevel] = useState(0)
  const [detailNotes, setDetailNotes] = useState('')
  const [menuHobbyId, setMenuHobbyId] = useState<string | null>(null)

  const hobbySessionsByHobby = useMemo(() => {
    const map: Record<string, HobbySession[]> = {}
    for (const s of data.hobbySessions) {
      if (!s.deletedAt) {
        if (!map[s.hobbyId]) map[s.hobbyId] = []
        map[s.hobbyId].push(s)
      }
    }
    return map
  }, [data.hobbySessions])

  const activeHobbies = useMemo(() => data.hobbies.filter(h => !h.deletedAt), [data.hobbies])

  function openEditModal(hobby: Hobby) {
    setEditingHobby(hobby)
    setHobbyFormData({
      name: hobby.name,
      category: hobby.category,
      color: hobby.color,
      skillLevel: hobby.skillLevel,
      targetHours: hobby.targetHours,
      notes: hobby.notes,
    })
    setIsHobbyModalOpen(true)
  }

  function openDetailPanel(hobby: Hobby) {
    setDetailHobby(hobby)
    setDetailSkillLevel(hobby.skillLevel)
    setDetailNotes(hobby.notes)
  }

  async function handleSaveHobby() {
    const now = isoNow()
    if (editingHobby) {
      const prev = { ...editingHobby }
      await db.hobbies.update(editingHobby.id, { ...hobbyFormData, updatedAt: now })
      push({
        description: `Updated hobby ${hobbyFormData.name}`,
        undo: async () => { await db.hobbies.update(editingHobby.id, prev); await loadData() },
        redo: async () => { await db.hobbies.update(editingHobby.id, { ...hobbyFormData, updatedAt: now }); await loadData() }
      })
    } else {
      const id = uuid()
      const newHobby: Hobby = { ...hobbyFormData, id, createdAt: now, updatedAt: now }
      await db.hobbies.add(newHobby)
      push({
        description: `Added hobby ${hobbyFormData.name}`,
        undo: async () => { await db.hobbies.delete(id); await loadData() },
        redo: async () => { await db.hobbies.add(newHobby); await loadData() }
      })
    }
    await loadData()
    setIsHobbyModalOpen(false)
  }

  async function handleDeleteHobby(hobby: Hobby) {
    const now = isoNow()
    await db.hobbies.update(hobby.id, { deletedAt: now, updatedAt: now })
    await loadData()
    push({
      description: `Deleted hobby ${hobby.name}`,
      undo: async () => { await db.hobbies.update(hobby.id, { deletedAt: null, updatedAt: now }); await loadData() },
      redo: async () => { await db.hobbies.update(hobby.id, { deletedAt: now, updatedAt: now }); await loadData() }
    })
    setMenuHobbyId(null)
  }

  async function handleLogSession() {
    if (!logHobbyId) return
    const now = isoNow()
    const hobby = data.hobbies.find(h => h.id === logHobbyId)
    if (!hobby) return
    const session: HobbySession = {
      id: uuid(),
      hobbyId: logHobbyId,
      durationMinutes: sessionFormData.duration,
      startAt: now,
      endAt: now,
      note: sessionFormData.note,
      createdAt: now,
      updatedAt: now,
    }
    await db.hobbySessions.add(session)
    const totalMinutes = (hobbySessionsByHobby[logHobbyId] || []).reduce((a, s) => a + s.durationMinutes, 0) + session.durationMinutes
    const newSkillLevel = Math.min(100, Math.floor(totalMinutes / 600))
    await db.hobbies.update(logHobbyId, { skillLevel: newSkillLevel, updatedAt: now })
    await loadData()
    setLogHobbyId(null)
    setSessionFormData({ duration: 30, note: '' })
  }

  async function handleSaveDetail() {
    if (!detailHobby) return
    const now = isoNow()
    const prev = { ...detailHobby }
    await db.hobbies.update(detailHobby.id, { skillLevel: detailSkillLevel, notes: detailNotes, updatedAt: now })
    await loadData()
    push({
      description: `Updated hobby ${detailHobby.name}`,
      undo: async () => { await db.hobbies.update(detailHobby.id, prev); await loadData() },
      redo: async () => { await db.hobbies.update(detailHobby.id, { skillLevel: detailSkillLevel, notes: detailNotes, updatedAt: now }); await loadData() }
    })
  }

  // ── Detail panel helpers ──
  const detailSessions = detailHobby ? (hobbySessionsByHobby[detailHobby.id] || []).sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()) : []
  const detailMinutesByDay = useMemo(() => {
    if (!detailHobby) return {}
    const map: Record<string, number> = {}
    for (const s of (hobbySessionsByHobby[detailHobby.id] || [])) {
      const day = format(new Date(s.startAt), 'yyyy-MM-dd')
      map[day] = (map[day] ?? 0) + s.durationMinutes
    }
    return map
  }, [detailHobby, hobbySessionsByHobby])

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Hobbies</h2>
        <Button onClick={() => { setHobbyFormData({ name: '', category: 'creative', color: '#a855f7', skillLevel: 0, targetHours: 0, notes: '' }); setEditingHobby(null); setIsHobbyModalOpen(true) }}>Add Hobby</Button>
      </div>
      
      <div className="flex gap-2">
        <button onClick={() => setFilter('')} className={cn('px-3 py-1 rounded-full text-xs', filter === '' ? 'bg-slate-700 text-white' : 'bg-slate-100')}>All</button>
        {HOBBY_CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setFilter(c.value)} className={cn('px-3 py-1 rounded-full text-xs', filter === c.value ? 'text-white' : 'bg-slate-100')} style={{backgroundColor: filter === c.value ? c.color : undefined}}>{c.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activeHobbies.filter(h => !filter || h.category === filter).map(hobby => (
          <Card key={hobby.id} className="p-4 space-y-3 cursor-pointer hover:border-primary-500" onClick={() => openDetailPanel(hobby)}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: hobby.color }} />
                <span className="font-medium">{hobby.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100">{HOBBY_CATEGORIES.find(c => c.value === hobby.category)?.label}</span>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="More actions"
                    onClick={(e) => { e.stopPropagation(); setMenuHobbyId(menuHobbyId === hobby.id ? null : hobby.id) }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                  >
                    <span className="block text-lg leading-none">⋯</span>
                  </button>
                  {menuHobbyId === hobby.id && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setMenuHobbyId(null) }} />
                      <div className="absolute right-0 z-30 mt-1 w-36 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={() => { openEditModal(hobby); setMenuHobbyId(null) }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={() => handleDeleteHobby(hobby)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{hobbySkillLevel(hobby.skillLevel).label}</span>
                <span>{hobby.skillLevel}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500" style={{ width: `${hobby.skillLevel}%` }} />
              </div>
            </div>
            <div className="text-sm text-slate-500">
              Total time: {formatMinutes((hobbySessionsByHobby[hobby.id] || []).reduce((acc, s) => acc + s.durationMinutes, 0))}
            </div>
            <Button variant="primary" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); setLogHobbyId(hobby.id) }}>Log session</Button>
          </Card>
        ))}
      </div>

      {/* ── Add/Edit Hobby Modal ── */}
      <Modal open={isHobbyModalOpen} onClose={() => setIsHobbyModalOpen(false)} title={editingHobby ? 'Edit Hobby' : 'Add Hobby'}>
        <div className="space-y-3">
          <label className="label">Name</label>
          <input className="input" value={hobbyFormData.name} onChange={(e) => setHobbyFormData({...hobbyFormData, name: e.target.value})} />
          <label className="label">Category</label>
          <select className="input" value={hobbyFormData.category} onChange={(e) => setHobbyFormData({...hobbyFormData, category: e.target.value as HobbyCategory})}>
            {HOBBY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <label className="label">Color</label>
          <input type="color" className="input h-10" value={hobbyFormData.color} onChange={(e) => setHobbyFormData({...hobbyFormData, color: e.target.value})} />
          <label className="label">Skill Level ({hobbyFormData.skillLevel}%)</label>
          <input type="range" min={0} max={100} className="w-full" value={hobbyFormData.skillLevel} onChange={(e) => setHobbyFormData({...hobbyFormData, skillLevel: Number(e.target.value)})} />
          <label className="label">Target Hours</label>
          <input type="number" className="input" value={hobbyFormData.targetHours} onChange={(e) => setHobbyFormData({...hobbyFormData, targetHours: Number(e.target.value)})} />
          <label className="label">Notes</label>
          <textarea className="input" value={hobbyFormData.notes} onChange={(e) => setHobbyFormData({...hobbyFormData, notes: e.target.value})} />
          <Button className="w-full" onClick={handleSaveHobby}>Save</Button>
          {editingHobby && (
            <Button variant="danger" className="w-full" onClick={async () => {
              if (!editingHobby) return
              await handleDeleteHobby(editingHobby)
              setIsHobbyModalOpen(false)
            }}>Delete Hobby</Button>
          )}
        </div>
      </Modal>

      {/* ── Log Session Modal ── */}
      <Modal open={!!logHobbyId} onClose={() => { setLogHobbyId(null); setSessionFormData({ duration: 30, note: '' }) }} title="Log Hobby Session">
        <div className="space-y-3">
          <label className="label">Duration (min)</label>
          <input type="number" className="input" value={sessionFormData.duration} onChange={(e) => setSessionFormData({...sessionFormData, duration: Number(e.target.value)})} />
          <label className="label">Note</label>
          <textarea className="input" value={sessionFormData.note} onChange={(e) => setSessionFormData({...sessionFormData, note: e.target.value})} />
          <Button className="w-full" onClick={handleLogSession}>Save</Button>
        </div>
      </Modal>

      {/* ── Detail Panel (slide-over) ── */}
      {detailHobby && (
        <>
          <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setDetailHobby(null)} />
          <div className="fixed right-0 top-0 z-40 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: detailHobby.color }} />
                <h3 className="text-lg font-semibold">{detailHobby.name}</h3>
              </div>
              <button onClick={() => setDetailHobby(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">✕</button>
            </div>

            {/* 90-day heatmap */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Activity (last 90 days)</h4>
              {(() => {
                const heatDays = Array.from({ length: 90 }, (_, i) => {
                  const d = subDays(new Date(), 89 - i)
                  const ds = format(d, 'yyyy-MM-dd')
                  return { date: d, ds, minutes: detailMinutesByDay[ds] ?? 0 }
                })
                const heatMax = Math.max(1, ...heatDays.map(d => d.minutes))
                const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
                const firstDow = heatDays[0].date.getDay()
                function getIntensityStep(minutes: number, max: number): number {
                  const intensity = max > 0 ? minutes / max : 0
                  if (intensity === 0) return 0
                  if (intensity < 0.2) return 1
                  if (intensity < 0.4) return 2
                  if (intensity < 0.6) return 3
                  return 4
                }
                return (
                  <div>
                    <div className="mb-1 grid grid-cols-7 gap-px text-[10px] font-medium text-slate-400">
                      {dayLabels.map((l, i) => <div key={i} className="text-center">{l}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-px rounded-sm border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 p-px">
                      {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
                      {heatDays.map(({ date, ds, minutes }, idx) => {
                        const isToday = ds === todayStr
                        const step = getIntensityStep(minutes, heatMax)
                        return (
                          <div
                            key={ds}
                            className={cn(
                              'group relative flex h-6 items-center justify-center text-[9px] font-medium transition-all',
                              isToday && 'ring-2 ring-primary-400 ring-inset z-10',
                              step === 0 && 'bg-white dark:bg-slate-800',
                              step === 1 && 'bg-primary-200 dark:bg-primary-900/50',
                              step === 2 && 'bg-primary-400 dark:bg-primary-800',
                              step === 3 && 'bg-primary-600 text-white dark:bg-primary-700',
                              step === 4 && 'bg-primary-800 text-white dark:bg-primary-900',
                            )}
                          >
                            <span>{idx + 1}</span>
                            <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800">
                              {format(date, 'd MMM')}: {minutes}m
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Skill level slider */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Skill Level ({detailSkillLevel}%)</h4>
              <input type="range" min={0} max={100} className="w-full" value={detailSkillLevel} onChange={(e) => setDetailSkillLevel(Number(e.target.value))} />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Beginner</span>
                <span>Expert</span>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Notes</h4>
              <textarea className="input" rows={3} value={detailNotes} onChange={(e) => setDetailNotes(e.target.value)} />
            </div>

            <Button className="w-full mb-6" onClick={async () => { await handleSaveDetail(); setDetailHobby(null) }}>Save Changes</Button>

            {/* Session history */}
            <div>
              <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Session History</h4>
              {detailSessions.length === 0 ? (
                <p className="text-sm text-slate-500">No sessions logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {detailSessions.slice(0, 20).map(s => (
                    <li key={s.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <div className="min-w-0">
                        <div className="text-slate-700 dark:text-slate-300 truncate">{s.note || 'No note'}</div>
                        <div className="text-xs text-slate-500">{format(new Date(s.startAt), 'd MMM yyyy')}</div>
                      </div>
                      <span className="shrink-0 text-slate-600">{formatMinutes(s.durationMinutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
