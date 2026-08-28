import { cn } from '../../lib/utils'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      className={cn(
        'h-5 w-5 cursor-pointer rounded border-slate-300 bg-slate-100 text-primary-600 accent-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
        'dark:border-slate-600 dark:bg-slate-700',
        'transition-colors duration-200',
        className
      )}
      {...props}
    />
  )
}
