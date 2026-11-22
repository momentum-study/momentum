// Lazy Firebase SDK loader.
//
// Firebase is not part of Momentum's boot path: the app is local-first and
// renders from IndexedDB without waiting for the cloud SDK or network. This
// module is the ONLY thing the boot path may import from the Firebase area,
// and it is deliberately SDK-free at import time — the SDK is loaded on
// demand the first time a cloud feature is actually used.
import { isFirebaseConfigured } from './firebase-config'
import type { FirebaseRuntime } from './firebase-runtime'

export { isFirebaseConfigured }

let runtimePromise: Promise<FirebaseRuntime | null> | null = null

/**
 * Load and initialise the Firebase SDK once. Resolves to null when Firebase
 * is not configured or initialisation fails (cloud features stay disabled).
 * A failed attempt clears the cached promise so a later call can retry.
 */
export function getFirebase(): Promise<FirebaseRuntime | null> {
  if (!runtimePromise) {
    runtimePromise = import('./firebase-runtime')
      .then(({ getFirebaseRuntime }) => getFirebaseRuntime())
      .catch((error) => {
        console.error('Firebase failed to load:', error)
        return null
      })
  }
  return runtimePromise
}
