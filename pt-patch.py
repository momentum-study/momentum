#!/usr/bin/env python3
"""Apply total-today display changes to PomodoroTimer atomically."""
p = 'src/components/widgets/PomodoroTimer.tsx'
content = open(p, encoding='utf-8').read()

# 1. Add formatTotalToday helper after fmt function
old = 'function playNotificationSound() {'
new = '''function formatTotalToday(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function playNotificationSound() {'''
assert old in content, 'PATCH 1: anchor not found'
content = content.replace(old, new, 1)

# 2. Update totalTodayMinutes memo
old = '''  const totalTodayMinutes = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const committed = data.sessions
      .filter((s) => !s.deletedAt && s.startAt.slice(0, 10) === todayStr)
      .reduce((sum, s) => sum + s.durationMinutes, 0)
    const live = Math.floor(simpleSeconds / 60)
    return committed + live
  }, [data.sessions, simpleSeconds])'''
new = '''  const totalTodayMinutes = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const committed = data.sessions
      .filter((s) => !s.deletedAt && s.startAt.slice(0, 10) === todayStr)
      .reduce((sum, s) => sum + s.durationMinutes, 0)
    let live = 0
    if (simpleStartedAt !== null) {
      live = simpleSeconds / 60
    } else if (pomStartedAt !== null && pomPhase === 'focus') {
      const focusDuration = config.focusMinutes * 60
      const elapsed = focusDuration - pomSeconds
      live = elapsed / 60
    }
    return committed + live + (simplePausedOffset / 60)
  }, [data.sessions, simpleSeconds, pomSeconds, simplePausedOffset, simpleStartedAt, pomStartedAt, pomPhase, config.focusMinutes])'''
assert old in content, 'PATCH 2: anchor not found'
content = content.replace(old, new, 1)

# 3. Update display line from formatMinutes to formatTotalToday
old = 'Today: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatMinutes(totalTodayMinutes)}</span> studied'
new = 'Total today: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatTotalToday(totalTodayMinutes)}</span>'
assert old in content, 'PATCH 3: anchor not found'
content = content.replace(old, new, 1)

# 4. Remove formatMinutes import
old = "import { cn, formatMinutes, isoNow } from '../../lib/utils'"
new = "import { cn, isoNow } from '../../lib/utils'"
assert old in content, 'PATCH 4: anchor not found'
content = content.replace(old, new, 1)

open(p, 'w', encoding='utf-8').write(content)
print('All patches applied successfully')
