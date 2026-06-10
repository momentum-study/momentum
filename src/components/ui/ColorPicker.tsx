import type { ChangeEvent } from 'react'
import { cn } from '../../lib/utils'

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4',
  '#10b981', '#f59e0b', '#ef4444', '#ec4899',
  '#14b8a6', '#f97316', '#a855f7', '#64748b',
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const handleCustom = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={cn(
              'h-8 w-8 rounded-full transition-transform hover:scale-110',
              value === c && 'ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500'
            )}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-400">Custom:</label>
        <input
          type="color"
          value={value}
          onChange={handleCustom}
          className="h-8 w-8 cursor-pointer rounded border border-slate-300 bg-transparent p-0 dark:border-slate-600"
        />
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{value}</span>
      </div>
    </div>
  )
}
