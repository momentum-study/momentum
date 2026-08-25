import type { ChangeEvent } from 'react'
import { cn } from '../../lib/utils'

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4',
  '#10b981', '#f59e0b', '#ef4444', '#ec4899',
  '#14b8a6', '#f97316', '#84cc16', '#64748b',
]

// Human-readable names for the preset swatches, shown on hover.
export const COLOR_NAMES: Record<string, string> = {
  '#6366f1': 'Indigo',
  '#8b5cf6': 'Violet',
  '#3b82f6': 'Blue',
  '#06b6d4': 'Cyan',
  '#10b981': 'Emerald',
  '#f59e0b': 'Amber',
  '#ef4444': 'Red',
  '#ec4899': 'Pink',
  '#14b8a6': 'Teal',
  '#f97316': 'Orange',
  '#84cc16': 'Lime',
  '#64748b': 'Slate',
}

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export const AUTO_COLOR = '__auto__'

// Deterministic palette for auto-color assignment (cycles on index)
export function autoColorFor(index: number): string {
  return COLOR_PRESETS[index % COLOR_PRESETS.length]
}

export const COLOR_AUTO_LABEL = 'Auto'
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const handleCustom = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          key={AUTO_COLOR}
          type="button"
          title={COLOR_AUTO_LABEL}
          aria-label="Auto-assign a color from the palette"
          className={cn(
            'h-8 w-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center border border-slate-300 dark:border-slate-600',
            'ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500'
          )}
          onClick={() => onChange(autoColorFor(Date.now()))}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">A</span>
        </button>
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            title={COLOR_NAMES[c] ?? c}
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
