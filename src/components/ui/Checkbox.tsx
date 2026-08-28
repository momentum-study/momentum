import { cn } from '../../lib/utils'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <label className={cn('relative inline-flex items-center justify-center cursor-pointer', className)}>
      <input
        type="checkbox"
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden
        className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed peer-checked:border-primary-600 peer-checked:bg-primary-600 dark:border-slate-600 dark:bg-slate-800"
      >
        <svg className="h-3.5 w-3.5 opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </label>
  )
}
