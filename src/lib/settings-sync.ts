// Cloud sync for user preferences (settings + dashboard/nav layout).
// When signed in, every save also writes to Firestore.
// On sign-in, pull cloud prefs and apply to localStorage if present.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db as firestore, isFirebaseConfigured } from './firebase'
import { isoNow } from './utils'
import type { Settings } from '../features/settings/SettingsPage'

const CLOUD_COLLECTION = 'userSettings'

export interface CloudPrefsPayload {
  uid: string
  settings: Settings
  dashboardWidgets: string[]
  navPrefs: string[]
  updatedAt: string
}

/** Push all user prefs to Firestore. No-op if not signed in or Firebase unconfigured. */
export async function pushSettings(
  uid: string,
  settings: Settings,
  dashboardWidgets: string[],
  navPrefs: string[],
): Promise<void> {
  if (!isFirebaseConfigured || !firestore) return
  try {
    await setDoc(doc(firestore, CLOUD_COLLECTION, uid), {
      uid,
      settings,
      dashboardWidgets,
      navPrefs,
      updatedAt: isoNow(),
    } satisfies CloudPrefsPayload)
  } catch (e) {
    console.warn('Failed to push settings to cloud:', e)
  }
}

/** Pull all user prefs from Firestore. Returns null if nothing stored or not configured. */
export async function pullSettings(uid: string): Promise<CloudPrefsPayload | null> {
  if (!isFirebaseConfigured || !firestore) return null
  try {
    const snap = await getDoc(doc(firestore, CLOUD_COLLECTION, uid))
    if (!snap.exists()) return null
    const data = snap.data()
    return (data as CloudPrefsPayload) ?? null
  } catch (e) {
    console.warn('Failed to pull settings from cloud:', e)
    return null
  }
}
