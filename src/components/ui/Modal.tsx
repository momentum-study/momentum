import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const [isOpening, setIsOpening] = useState(false)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    if (open && !el.open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null
      setIsOpening(true)
      el.showModal()
      requestAnimationFrame(() => {
        // Prefer form controls (input, select, textarea) over buttons to avoid focusing the close button first
        const formControl = el.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea')
        if (formControl) {
          formControl.focus()
        } else {
          const focusable = el.querySelector<HTMLElement>(
            'button, [href], [tabindex]:not([tabindex="-1"])'
          )
          focusable?.focus()
        }
        setIsOpening(false)
      })
    }
    if (!open && el.open) {
      el.close()
      lastFocusedRef.current?.focus()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={cn(
        'w-full max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-lg backdrop:backdrop-blur-sm backdrop:bg-black/40',
        'dark:border-slate-700 dark:bg-slate-800',
        'transition-opacity duration-150',
        isOpening ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100',
        className
      )}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const el = dialogRef.current
        if (!el) return
        const focusable = el.querySelectorAll<HTMLElement>(
          'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
      )}
      <div className="p-4">{children}</div>
    </dialog>
  )
}