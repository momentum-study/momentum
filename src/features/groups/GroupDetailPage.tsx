// Group detail page — shows member stats, leaderboard, invites.

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../app/auth-provider'
import { groupService } from '../../lib/group-service'
import { syncService } from '../../lib/sync-service'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn } from '../../lib/utils'
import type { Group, GroupMember, MemberStats as MemberStatsType } from '../../domain/cloud-types'
import { doc, getDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../../lib/firebase'

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [stats, setStats] = useState<MemberStatsType[]>([])
  const [loading, setLoading] = useState(true)
  const [showLeave, setShowLeave] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState<'week' | 'month' | 'total' | 'streak'>('week')

  const fetchStats = useCallback(async (groupId: string, memberList: GroupMember[]) => {
    if (!isFirebaseConfigured || !db) return
    const results: MemberStatsType[] = []
    for (const m of memberList) {
      const ref = doc(db, 'groupStats', `${groupId}_${m.uid}`)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        results.push(snap.data() as MemberStatsType)
      } else {
        // No stats yet — compute from sessions
        const sessions = await syncService.fetchUserSessions(m.uid)
        const s = await syncService.refreshMemberStats(
          groupId, m.uid, m.displayName, m.photoURL ?? null, sessions
        )
        if (s) results.push(s)
      }
    }
    setStats(results)
  }, [])

  useEffect(() => {
    if (!id || !user) return
    void load(id)
  }, [id, user])

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
      case 'week': return b.weekMinutes - a.weekMinutes
      case 'month': return b.monthMinutes - a.monthMinutes
      case 'total': return b.totalMinutes - a.totalMinutes
      case 'streak': return b.currentStreak - a.currentStreak
      default: return 0
    }
  })

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

      <div className="flex gap-2">
        {(['week', 'month', 'total', 'streak'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              sortBy === s
                ? 'bg-primary-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
            )}
          >
            {s === 'week' ? 'This Week'
             : s === 'month' ? 'This Month'
             : s === 'total' ? 'All Time'
             : 'Streak'}
          </button>
        ))}
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
                <div className="font-medium text-slate-800 dark:text-slate-100">
                  {s.displayName}
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span>🔥 {s.currentStreak} day streak</span>
                  <span>📅 {s.totalSessions} sessions</span>
                </div>
              </div>
              <div className="text-right">
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