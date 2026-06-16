// Groups list page — shows the user's groups, with create and join options.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/auth-provider'
import { groupService } from '../../lib/group-service'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { cn } from '../../lib/utils'
import type { Group } from '../../domain/cloud-types'

function groupColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue = ((h % 360) + 360) % 360
  return { bg: `hsl(${hue}, 60%, 85%)`, accent: `hsl(${hue}, 70%, 45%)` }
}

export default function GroupsPage() {
  const { user, profile, isConfigured, isLoading: authLoading } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    void refresh()
  }, [user])

  async function refresh() {
    if (!user) return
    setLoading(true)
    try {
      const list = await groupService.listMyGroups(user.uid)
      setGroups(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups')
    } finally {
      setLoading(false)
    }
  }

  async function createGroup() {
    if (!user || !profile || !name.trim()) return
    try {
      await groupService.createGroup(
        name.trim(),
        description.trim(),
        user.uid,
        profile.displayName,
        profile.photoURL ?? null
      )
      setShowCreate(false)
      setName('')
      setDescription('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group')
    }
  }

  async function joinGroup() {
    if (!user || !profile || !inviteCode.trim()) return
    try {
      await groupService.joinGroup(
        inviteCode.trim().toUpperCase(),
        user.uid,
        profile.displayName,
        profile.photoURL ?? null
      )
      setShowJoin(false)
      setInviteCode('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join group')
    }
  }

  if (authLoading || loading) return <PageSpinner />

  if (!isConfigured) {
    return (
      <EmptyState
        title="Cloud features are not configured"
        description="To use groups, set up a Firebase project and add credentials to src/lib/firebase.ts"
        icon="☁️"
      />
    )
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to use groups"
        description="Open Settings → Account to sign in with Google."
        icon="🔐"
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Groups</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowJoin(true)}>
            Join
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            Create
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create a group and invite friends with a code, or join one with an invite."
          icon="👥"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowJoin(true)}>Join a Group</Button>
              <Button variant="primary" onClick={() => setShowCreate(true)}>Create a Group</Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const { bg, accent } = groupColor(g.name)
            const initial = g.name.trim().charAt(0).toUpperCase() || '?'
            return (
            <Link key={g.id} to={`/groups/${g.id}`}>
              <Card className={cn('overflow-hidden transition-shadow hover:shadow-md')}>
                <div className="-mx-4 -mt-4 mb-3 flex items-center justify-center py-6" style={{ backgroundColor: bg }}>
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold text-white"
                    style={{ backgroundColor: accent }}
                    aria-hidden
                  >
                    {initial}
                  </div>
                </div>
                <div className="font-medium text-slate-800 dark:text-slate-100" style={{ color: accent }}>{g.name}</div>
                {g.description && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{g.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>👥 {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
                  <span className="font-mono">{g.inviteCode}</span>
                </div>
              </Card>
            </Link>
            )
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Group">
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="input"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button variant="primary" className="w-full" onClick={createGroup}>
            Create
          </Button>
        </div>
      </Modal>

      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Join Group">
        <div className="space-y-3">
          <input
            className="input font-mono uppercase"
            placeholder="Invite code (e.g. ABC123)"
            maxLength={6}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <Button variant="primary" className="w-full" onClick={joinGroup}>
            Join
          </Button>
        </div>
      </Modal>
    </div>
  )
}
