import { useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { cn } from '../../lib/utils'
import type { Session } from '../../domain/types'

interface HeatmapGridProps {
  sessions: Session[]
  startDate: Date
  days: number
}

function getIntensityStep(minutes: number, max: number): number {
  const intensity = max > 0 ? minutes / max : 0
  if (intensity === 0) return 0
  if (intensity < 0.2) return 1
  if (intensity < 0.4) return 2
  if (intensity < 0.6) return 3
  return 4 // >= 0.6
}

export function HeatmapGrid({ sessions, startDate, days }: HeatmapGridProps) {
  const minutesByDay = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      if (s.deletedAt) continue
      const day = format(new Date(s.startAt), 'yyyy-MM-dd')
      map[day] = (map[day] ?? 0) + s.durationMinutes
    }
    return map
  }, [sessions])

  const todayStr = format(startDate, 'yyyy-MM-dd')
  const heatDays = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const d = subDays(startDate, days - 1 - i)
      const ds = format(d, 'yyyy-MM-dd')
      return { date: d, ds, minutes: minutesByDay[ds] ?? 0 }
    })
  }, [startDate, days, minutesByDay])

  const heatMax = useMemo(() => {
    return Math.max(60, ...heatDays.map((d) => d.minutes))
  }, [heatDays])

  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const firstDow = heatDays[0].date.getDay()

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-px text-[10px] font-medium text-slate-400">
        {dayLabels.map((l, i) => (
          <div key={i} className="text-center">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px rounded-sm border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 p-px">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
        {heatDays.map(({ date, ds, minutes }) => {
          const isToday = ds === todayStr
          const step = getIntensityStep(minutes, heatMax)
          return (
            <div
              key={ds}
              aria-label={`${format(date, 'EEEE, MMMM d, yyyy')}: ${minutes} minutes`}
              className={cn(
                'group relative flex h-4 items-center justify-center text-[10px] font-medium transition-all',
                isToday && 'ring-2 ring-green-400 ring-inset z-10',
                step === 0 && 'bg-slate-200 dark:bg-slate-700',
                step === 1 && 'bg-green-300',
                step === 2 && 'bg-green-400',
                step === 3 && 'bg-green-500 text-white',
                step === 4 && 'bg-green-600 text-white',
              )}
            >
              <span>{date.getDate()}</span>
              <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-800">
                {format(date, 'd MMM')}: {minutes}m
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HeatmapGrid