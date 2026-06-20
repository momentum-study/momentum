// Group detail page — shows member stats, leaderboard, invites.

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../app/auth-provider'
import { groupService } from '../../lib/group-service'
import { syncService } from '../../lib/sync-service'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn } from '../../lib/utils'
import type { Group, GroupMember, SyncedSession, MemberStats as MemberStatsType, GroupPresence } from '../../domain/cloud-types'
import { isFirebaseConfigured } from '../../lib/firebase'
import { db as localDb } from '../../db/app-db'

type WindowKey = 'today' | 'week' | 'month' | 'total' | 'streak'

function windowSessionCount(s: MemberStatsType, w: WindowKey): number {
  switch (w) {
    case 'today': return s.todaySessions ?? s.totalSessions
    case 'week': return s.weekSessions ?? s.totalSessions
    case 'month': return s.monthSessions ?? s.totalSessions
    case 'total': return s.totalSessions
    case 'streak': return s.totalSessions
  }
}

function getStoredWindow(groupId: string): WindowKey {
  if (typeof localStorage === 'undefined') return 'today'
  const v = localStorage.getItem(`momentum-group-window-${groupId}`)
  if (v === 'today' || v === 'week' || v === 'month' || v === 'total' || v === 'streak') return v
  return 'today'
}

function setStoredWindow(groupId: string, w: WindowKey) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(`momentum-group-window-${groupId}`, w)
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [stats, setStats] = useState<MemberStatsType[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showLeave, setShowLeave] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState<WindowKey>('today')
  const [presence, setPresence] = useState<GroupPresence[]>([])
  const initialWindowLoaded = useRef(false)

  const fetchStats = useCallback(async (groupId: string, memberList: GroupMember[]) => {
    if (!isFirebaseConfigured) return
    const currentUid = user?.uid
    const memberUids = memberList.map((m) => m.uid)
    // Fetch ALL group sessions in one batch so every member's stats are
    // computed from the same data set with the same time reference.
    let allSessions = await syncService.fetchGroupSessions(groupId, memberUids)
    // Merge current user's local sessions so unsynced sessions show.
    if (currentUid) {
      const localSessions = await localDb.sessions.toArray()
      const localSynced: SyncedSession[] = localSessions.map((s) => ({
        id: s.id,
        uid: currentUid,
        subjectName: s.note ?? 'Unknown Subject',
        minutes: s.durationMinutes,
        startAt: s.startAt,
        endAt: s.endAt,
        createdAt: s.createdAt,
      }))
      const cloudIds = new Set(allSessions.map((s) => s.id))
      for (const ls of localSynced) {
        if (!cloudIds.has(ls.id)) allSessions.push(ls)
      }
    }
    const results: MemberStatsType[] = []
    for (const m of memberList) {
      const s = await syncService.refreshMemberStats(
        groupId, m.uid, m.displayName, m.photoURL ?? null, allSessions
      )
      if (s) results.push(s)
    }
    setStats(results)
  }, [user])

  useEffect(() => {
    if (!id || !user) return
    // Load stored window preference for this group
    if (!initialWindowLoaded.current && id) {
      const stored = getStoredWindow(id)
      setSortBy(stored)
      initialWindowLoaded.current = true
    }
    void load(id)
  }, [id, user])

  useEffect(() => {
    if (!id) return
    return groupService.subscribePresence(id, setPresence)
  }, [id])

  async function load(groupId: string) {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const g = await groupService.getGroup(groupId)
      if (!g) {
        setError('Group not found')
        setLoading(false)
        return
      }
      setGroup(g)
      const memberList = await groupService.listMembers(groupId)
      await fetchStats(groupId, memberList)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load group')
    } finally {
      setLoading(false)
    }
  }

  /** Called when user switches the time window. Re-fetches fresh session data for all members. */
  async function switchWindow(w: WindowKey) {
    setSortBy(w)
    if (id) setStoredWindow(id, w)
    if (!user || !id) return
    setRefreshing(true)
    try {
      const memberList = await groupService.listMembers(id)
      await fetchStats(id, memberList)
    } catch {
      // Silently fail — stale data is still displayed
    } finally {
      setRefreshing(false)
    }
  }

  async function leaveGroup() {
    if (!id || !user) return
    try {
      await groupService.leaveGroup(id, user.uid)
      setShowLeave(false)
      // Navigate back to groups list
      window.location.hash = '#/groups'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to leave group')
    }
  }

  function copyInvite() {
    if (!group) return
    navigator.clipboard.writeText(group.inviteCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) return <PageSpinner />

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link to="/groups" className="text-primary-500 underline">Back to groups</Link>
      </div>
    )
  }

  if (!group) return null

  const sortedStats = [...stats].sort((a, b) => {
    switch (sortBy) {
      case 'today': return b.todayMinutes - a.todayMinutes
      case 'week': return b.weekMinutes - a.weekMinutes
      case 'month': return b.monthMinutes - a.monthMinutes
      case 'total': return b.totalMinutes - a.totalMinutes
      case 'streak': return b.currentStreak - a.currentStreak
      default: return 0
    }
  })

  const presenceByUid = useMemo(() => {
    const m = new Map<string, GroupPresence>()
    for (const p of presence) m.set(p.uid, p)
    return m
  }, [presence])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{group.name}</h2>
          {group.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={copyInvite}>
            {copied ? 'Copied!' : 'Copy Code'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowLeave(true)}>
            Leave
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'total', 'streak'] as const).map((s) => (
          <button
            key={s}
            onClick={() => void switchWindow(s)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              sortBy === s
                ? 'bg-primary-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
            )}
          >
            {s === 'today' ? 'Today'
             : s === 'week' ? 'This Week'
             : s === 'month' ? 'This Month'
             : s === 'total' ? 'All Time'
             : 'Streak'}
          </button>
        ))}
        {refreshing && (
          <span className="ml-2 text-xs text-slate-400 animate-pulse">Refreshing…</span>
        )}
      </div>

      <div className="grid gap-4">
        {sortedStats.length === 0 && (
          <p className="text-sm text-slate-500">No one has synced any study time yet.</p>
        )}
        {sortedStats.map((s) => (
          <Card key={s.uid}>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {s.displayName[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{s.displayName}</span>
                  {(() => {
                    const p = presenceByUid.get(s.uid)
                    if (!p) return null
                    const mins = Math.floor((p.elapsedSeconds ?? 0) / 60)
                    return (
                      <span className="flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        {'Studying ' + p.subjectName + ' \u00b7 ' + mins + 'm'}
                      </span>
                    )
                  })()}
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span>🔥 {s.currentStreak} day streak</span>
                  <span>📅 {windowSessionCount(s, sortBy)} sessions</span>
                </div>
              </div>
              <div className="text-right">
                {sortBy === 'today' && (
                  <div className="text-lg font-bold text-primary-600 dark:text-primary-400">{Math.round(s.todayMinutes)}<span className="text-xs font-normal text-slate-500">m</span></div>
                )}
                {sortBy === 'week' && (
                  <div className="text-lg font-bold text-primary-600 dark:text-primary-400">{Math.round(s.weekMinutes)}<span className="text-xs font-normal text-slate-500">m</span></div>
                )}
                {sortBy === 'month' && (
                  <div className="text-lg font-bold text-primary-600 dark:text-primary-400">{Math.round(s.monthMinutes)}<span className="text-xs font-normal text-slate-500">m</span></div>
                )}
                {sortBy === 'total' && (
                  <div className="text-lg font-bold text-primary-600 dark:text-primary-400">{Math.round(s.totalMinutes)}<span className="text-xs font-normal text-slate-500">m</span></div>
                )}
                {sortBy === 'streak' && (
                  <div className="text-lg font-bold text-orange-600">{s.currentStreak}<span className="text-xs font-normal text-slate-500">d</span></div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showLeave} onClose={() => setShowLeave(false)} title="Leave Group?">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Your data stays in Momentum. You can rejoin anytime with the invite code.
        </p>
        <Button variant="danger" className="w-full" onClick={leaveGroup}>
          Leave Group
        </Button>
      </Modal>
    </div>
  )
}