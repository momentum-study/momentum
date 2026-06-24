// Live group presence — subscribes to a group's presence subcollection
// and exposes a tick that re-derives elapsed seconds at 1s for live UI updates.
import { useEffect, useState } from 'react'
import { groupService } from './group-service'
import type { GroupPresence } from '../domain/cloud-types'

/**
 * Subscribes to live presence records for a group and returns them with
 * `elapsedSeconds` ticked every second. Returns an empty array when
 * `groupId` is null (no group selected).
 */
export function useGroupPresence(groupId: string | null): GroupPresence[] {
  const [records, setRecords] = useState<GroupPresence[]>([])
  // Bumped every second; presence records are immutable until snapshot fires,
  // so we re-derive elapsedSeconds by recomputing against the wall clock.
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!groupId) {
      setRecords([])
      return
    }
    return groupService.subscribePresence(groupId, setRecords)
  }, [groupId])

  useEffect(() => {
    if (records.length === 0) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [records.length])

  if (records.length === 0) return records
  const now = Date.now()
  return records.map((r) => ({ ...r, elapsedSeconds: Math.floor((now - r.startedAt) / 1000) }))
}
