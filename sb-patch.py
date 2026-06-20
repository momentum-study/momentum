#!/usr/bin/env python3
"""Apply subject breakdown changes atomically across multiple files."""
import re

# --- 1. Add getLiveTimerSubjectId to timer-utils.ts ---
p = 'src/lib/timer-utils.ts'
content = open(p, encoding='utf-8').read()

old = """export function isTimerRunning(): boolean {"""
new = """/** Get the subjectId of the currently active timer session. */
export function getLiveTimerSubjectId(): string | null {
  const state = loadTimerState()
  return state?.subjectId ?? null
}

/** Check if a timer is currently running (not paused, not stopped). */"""
assert old in content, 'timer-utils: isTimerRunning not found'
content = content.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(content)
print('timer-utils.ts updated')

# --- 2. Update PomodoroTimer.tsx to save subjectId in all saveTimerState calls ---
p = 'src/components/widgets/PomodoroTimer.tsx'
content = open(p, encoding='utf-8').read()

# Find all saveTimerState({ ... }) blocks that contain mode but not subjectId
# Strategy: find each block and add subjectId if missing
lines = content.split('\n')
output = []
i = 0
count = 0
while i < len(lines):
    line = lines[i]
    output.append(line)

    # Detect start of a PersistedTimerState object literal inside saveTimerState
    stripped = line.strip()
    if stripped.startswith("mode:") and ("'simple'" in stripped or "'pomodoro'" in stripped):
        # Check if this block already has subjectId
        has_subject = False
        search_end = min(i + 15, len(lines))
        for k in range(i, search_end):
            if 'subjectId' in lines[k]:
                has_subject = True
                break
            if lines[k].strip() == '}':
                break

        if not has_subject:
            # Find the closing } of this object and insert before it
            for k in range(i + 1, min(i + 15, len(lines))):
                if lines[k].strip() == '}':
                    indent = lines[k][:len(lines[k]) - len(lines[k].lstrip())]
                    output.append(indent + 'subjectId: subjectId,')
                    count += 1
                    break

    i += 1

content = '\n'.join(output)
open(p, 'w', encoding='utf-8').write(content)
print(f'PomodoroTimer.tsx updated ({count} subjectId entries added)')

# --- 3. Create SubjectBreakdown component ---
component = '''// SubjectBreakdown — shows today's study time grouped by subject.
// Used in the Dashboard "Today" widget.

import { useMemo } from 'react'
import type { Session, Subject } from '../../domain/types'

interface SubjectBreakdownProps {
  sessions: Session[]
  subjects: Subject[]
  todayStr: string
  liveTimerSeconds?: number
  liveTimerSubjectId?: string | null
}

export function SubjectBreakdown({
  sessions,
  subjects,
  todayStr,
  liveTimerSeconds = 0,
  liveTimerSubjectId = null,
}: SubjectBreakdownProps) {
  const subjectMap = useMemo(
    () => new Map(subjects.filter((s) => !s.deletedAt).map((s) => [s.id, s])),
    [subjects]
  )

  const breakdown = useMemo(() => {
    // Group committed sessions
    const minutesBySubject = new Map<string, number>()
    for (const s of sessions) {
      if (s.deletedAt) continue
      if (s.startAt.slice(0, 10) !== todayStr) continue
      minutesBySubject.set(s.subjectId, (minutesBySubject.get(s.subjectId) ?? 0) + s.durationMinutes)
    }

    // Add live timer seconds
    if (liveTimerSeconds > 0 && liveTimerSubjectId) {
      const liveMinutes = liveTimerSeconds / 60
      minutesBySubject.set(liveTimerSubjectId, (minutesBySubject.get(liveTimerSubjectId) ?? 0) + liveMinutes)
    }

    const total = Array.from(minutesBySubject.values()).reduce((a, b) => a + b, 0)
    if (total === 0) return []

    return Array.from(minutesBySubject.entries())
      .map(([id, minutes]) => ({
        id,
        name: subjectMap.get(id)?.name ?? 'Unknown',
        color: subjectMap.get(id)?.color ?? '#94a3b8',
        minutes,
        pct: Math.round((minutes / total) * 100),
      }))
      .sort((a, b) => b.minutes - a.minutes)
  }, [sessions, subjects, todayStr, liveTimerSeconds, liveTimerSubjectId, subjectMap])

  if (breakdown.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No study time logged today</p>
  }

  return (
    <div className="space-y-1.5">
      {breakdown.map((row) => (
        <div key={row.id} className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{row.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">{Math.round(row.minutes)}m</span>
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${row.pct}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-500">{row.pct}%</span>
        </div>
      ))}
    </div>
  )
}
'''

open('src/components/widgets/SubjectBreakdown.tsx', 'w', encoding='utf-8').write(component)
print('SubjectBreakdown.tsx created')

# --- 4. Update Dashboard to import and use SubjectBreakdown ---
p = 'src/features/dashboard/Dashboard.tsx'
content = open(p, encoding='utf-8').read()

# Add import
old = "import { TodaysRoutinesList } from '../../components/widgets/TodaysRoutinesList'"
new = "import { TodaysRoutinesList } from '../../components/widgets/TodaysRoutinesList'\nimport { SubjectBreakdown } from '../../components/widgets/SubjectBreakdown'"
assert old in content, 'Dashboard: TodaysRoutinesList import not found'
content = content.replace(old, new, 1)

# Add getLiveTimerSubjectId import
old = "import { formatTotalToday, getLiveTimerSeconds, isTimerActive } from '../../lib/timer-utils'"
new = "import { formatTotalToday, getLiveTimerSeconds, getLiveTimerSubjectId, isTimerActive } from '../../lib/timer-utils'"
assert old in content, 'Dashboard: timer-utils import not found'
content = content.replace(old, new, 1)

# Add liveTimerSubjectId state
old = """  const [liveTimerSeconds, setLiveTimerSeconds] = useState(0)
  useEffect(() => {
    if (!isTimerActive()) { setLiveTimerSeconds(0); return }
    const tick = () => setLiveTimerSeconds(getLiveTimerSeconds())
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])"""
new = """  const [liveTimerSeconds, setLiveTimerSeconds] = useState(0)
  const [liveTimerSubjectId, setLiveTimerSubjectId] = useState<string | null>(null)
  useEffect(() => {
    if (!isTimerActive()) { setLiveTimerSeconds(0); setLiveTimerSubjectId(null); return }
    const tick = () => {
      setLiveTimerSeconds(getLiveTimerSeconds())
      setLiveTimerSubjectId(getLiveTimerSubjectId())
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])"""
assert old in content, 'Dashboard: liveTimerSeconds state not found'
content = content.replace(old, new, 1)

# Add SubjectBreakdown to the Today widget, below the routines/tasks flex container
old = """            </div>
          </Card>
        </Collapsible>
      )}

      {isWidgetVisible('streak-goal')"""
new = """            </div>

            {/* Subject breakdown */}
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Today by Subject</span>
              </div>
              <SubjectBreakdown
                sessions={academicSessions}
                subjects={data.subjects}
                todayStr={todayStr}
                liveTimerSeconds={liveTimerSeconds}
                liveTimerSubjectId={liveTimerSubjectId}
              />
            </div>
          </Card>
        </Collapsible>
      )}

      {isWidgetVisible('streak-goal')"""
assert old in content, 'Dashboard: Today widget closing not found'
content = content.replace(old, new, 1)

open(p, 'w', encoding='utf-8').write(content)
print('Dashboard.tsx updated')
