/**
 * Vitest test setup.
 *
 * jsdom doesn't implement `window.matchMedia`, but `loadSettings()` reads it
 * to decide dark mode. Stub it out so utility tests that pull in
 * `settings-store` don't throw at import time.
 */

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}