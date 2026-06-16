import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'secondary' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 focus:ring-2 focus:ring-offset-2',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-primary-500 focus:ring-2 focus:ring-offset-2 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 focus:ring-2 focus:ring-offset-2',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2 py-1 text-xs',
  md: '',
  lg: 'px-4 py-3 text-base',
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button className={cn('inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed', variantClasses[variant], sizeClasses[size], className)} {...props}>
      {children}
    </button>
  )
}