// Cloud data model types for Firebase sync and groups.
// All timestamps are ISO strings for consistency with the local data model.

export interface UserProfile {
  uid: string
  displayName: string
  photoURL?: string | null
  createdAt: string
  updatedAt: string
  lastActiveAt: string
}

export interface Group {
  id: string
  name: string
  description?: string
  inviteCode: string  // 6-char alphanumeric, generated server-side or client-side
  createdBy: string   // uid
  createdAt: string
  updatedAt: string
  memberCount: number
}

export interface GroupMember {
  groupId: string
  uid: string
  displayName: string
  photoURL?: string | null
  joinedAt: string
  role: 'owner' | 'member'
}

// Study session synced to Firestore — stripped down to what's shareable.
// No habit data, marks, or assignments are synced.
export interface SyncedSession {
  id: string        // same as local session id
  uid: string
  subjectName: string
  minutes: number
  startAt: string
  endAt?: string
  createdAt: string
  /** Monotonically increasing version for optimistic concurrency control.
   *  Incremented on each upsert; flush skips writes if remote version >= this. */
  version?: number
}

// Aggregated stats for a group member, computed from synced sessions.
// Used for the group leaderboard — avoids querying every session every time.
export interface MemberStats {
  uid: string
  displayName: string
  photoURL?: string | null
  groupId: string
  // Current streak of consecutive days with at least one session
  currentStreak: number
  // Total study minutes today (since midnight local time)
  todayMinutes: number
  // Total study minutes this week (Monday-Sunday)
  weekMinutes: number
  // Total study minutes this month
  monthMinutes: number
  // Total study minutes all-time
  totalMinutes: number
  // Total sessions today (since midnight local time). Optional for
  // backward compat with cached groupStats docs written before this field
  // existed — readers fall back to totalSessions.
  todaySessions?: number
  // Total sessions this week (Monday-Sunday). Optional for backward compat.
  weekSessions?: number
  // Total sessions this month. Optional for backward compat.
  monthSessions?: number
  // Total sessions all-time
  totalSessions: number
  lastSessionAt: string | null
  updatedAt: string
}

// Invite link payload — stored as a short-lived doc keyed by inviteCode.
export interface InviteLink {
  code: string
  groupId: string
  createdAt: string
  expiresAt: string
  usedCount: number
}


/** Studying presence for a group member — written when they start the timer, cleared on stop. */
export interface GroupPresence {
  uid: string
  displayName: string
  subjectName: string
  startedAt: number  // epoch ms
  updatedAt: number  // epoch ms — for stale timeout
  /** Computed client-side, not from Firestore */
  elapsedSeconds?: number
}