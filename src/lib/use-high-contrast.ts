import { useState, useEffect, useCallback } from 'react'

const HIGH_CONTRAST_KEY = 'momentum-high-contrast'

export function useHighContrast() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(HIGH_CONTRAST_KEY) === 'true'
  })

  useEffect(() => {
    document.body.classList.toggle('high-contrast', enabled)
    try { localStorage.setItem(HIGH_CONTRAST_KEY, String(enabled)) } catch {}
  }, [enabled])

  const toggle = useCallback(() => setEnabled(e => !e), [])
  return { enabled, toggle, setEnabled }
}
