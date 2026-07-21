import { useState, useEffect, useCallback } from 'react'

const FOCUS_MODE_KEY = 'momentum-focus-mode'

export function useFocusMode() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(FOCUS_MODE_KEY) === 'true'
  })

  useEffect(() => {
    if (enabled) {
      document.body.classList.add('focus-mode')
    } else {
      document.body.classList.remove('focus-mode')
    }
    try {
      localStorage.setItem(FOCUS_MODE_KEY, String(enabled))
    } catch {}
  }, [enabled])

  const toggle = useCallback(() => setEnabled(e => !e), [])

  return { enabled, toggle, setEnabled }
}
