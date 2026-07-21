import { useState, useEffect, useCallback } from 'react'

const COMPACT_MODE_KEY = 'momentum-compact-mode'

export function useCompactMode() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(COMPACT_MODE_KEY) === 'true'
  })

  useEffect(() => {
    document.body.classList.toggle('compact-mode', enabled)
    try { localStorage.setItem(COMPACT_MODE_KEY, String(enabled)) } catch {}
  }, [enabled])

  const toggle = useCallback(() => setEnabled(e => !e), [])
  return { enabled, toggle, setEnabled }
}
