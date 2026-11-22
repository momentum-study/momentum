// Auth context for cloud features (Firebase Auth).
// Exposes the current user, sign-in / sign-out actions, and loading state.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import { isoNow } from '../lib/utils'
import type { UserProfile } from '../domain/cloud-types'
import { db as localDb } from '../db/app-db'
import { loadSettings } from '../lib/settings-store'
import { isFirebaseConfigured, getFirebase } from '../lib/firebase'
interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  isLoading: boolean
  isConfigured: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: Partial<Pick<UserProfile, 'displayName'>>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const unsubSyncRef = useRef<(() => void) | null>(null)


  // Watch auth only when there is something to watch. Loading the Firebase
  // SDK costs ~470 kB, so a signed-out visitor must never trigger it. The
  // stored uid is the marker for "this browser has a cloud session".
  const [watchAuth, setWatchAuth] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('momentum-cloud-uid') !== null
  })

  // A sign-in in another tab writes the uid to localStorage; the `storage`
  // event fires in this tab. Reacting to it keeps the cross-tab behaviour
  // the unconditional auth subscription used to provide.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== 'momentum-cloud-uid') return
      setWatchAuth(e.newValue !== null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  useEffect(() => {
    if (!isFirebaseConfigured || !watchAuth) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    let unsubAuth: (() => void) | null = null
    void getFirebase().then(async (runtime) => {
      if (cancelled || !runtime) {
        setIsLoading(false)
        return
      }
      const { auth, db, authApi, firestoreApi } = runtime
      unsubAuth = authApi.onAuthStateChanged(auth, async (u: User | null) => {
        setUser(u)
        if (u) {
          localStorage.setItem('momentum-cloud-uid', u.uid)
          localStorage.setItem('momentum-cloud-name', u.displayName ?? u.email?.split('@')[0] ?? 'Anonymous')
        } else {
          localStorage.removeItem('momentum-cloud-uid')
          localStorage.removeItem('momentum-cloud-name')
        }
        if (unsubSyncRef.current) { unsubSyncRef.current(); unsubSyncRef.current = null }
        if (u) {
          const sync = await import('../lib/data-sync')
          unsubSyncRef.current = sync.subscribeToUserData(u.uid)
          sync.installSyncHooks(u.uid)
        } else {
          const sync = await import('../lib/data-sync')
          sync.uninstallSyncHooks()
        }
        if (u) {
          try {
            const ref = firestoreApi.doc(db, 'users', u.uid)
            const snap = await firestoreApi.getDoc(ref)
            if (snap.exists()) {
              setProfile(snap.data() as UserProfile)
              // Pull settings from cloud — apply directly to localStorage (no reload)
              const { pullSettings } = await import('../lib/settings-sync')
              const cloudPrefs = await pullSettings(u.uid)
              if (cloudPrefs) {
                // Don't clobber local settings that are newer than the cloud copy.
                // loadSettings() returns localStorage merged with defaults; settingsUpdatedAt
                // is '' when never saved locally.
                const localSettings = loadSettings()
                const localUpdatedAt = localSettings.settingsUpdatedAt
                if (!localUpdatedAt || new Date(localUpdatedAt).getTime() < new Date(cloudPrefs.updatedAt).getTime()) {
                  localStorage.setItem('momentum-settings', JSON.stringify(cloudPrefs.settings))
                  localStorage.setItem('momentum-dashboard-widgets', JSON.stringify(cloudPrefs.dashboardWidgets))
                  localStorage.setItem('momentum-nav-prefs', JSON.stringify(cloudPrefs.navPrefs))
                }
              }
              // Pull all user data from cloud, then refresh UI
              const sync = await import('../lib/data-sync')
              await sync.pullAllData(u.uid)
              window.dispatchEvent(new CustomEvent('momentum-data-synced'))
            } else {
              const now = isoNow()
              const newProfile: UserProfile = {
                uid: u.uid,
                displayName: u.displayName ?? u.email?.split('@')[0] ?? 'Anonymous',
                photoURL: u.photoURL ?? null,
                createdAt: now,
                updatedAt: now,
                lastActiveAt: now,
              }
              await firestoreApi.setDoc(ref, newProfile)
              setProfile(newProfile)
              const { syncService } = await import('../lib/sync-service')
              const allLocalSessions = await localDb.sessions.toArray()
              const toSync = allLocalSessions.slice(-200)
              const subjects = await localDb.subjects.toArray()
              const subjectNames = new Map(subjects.map((s) => [s.id, s.name]))
              for (const s of toSync) {
                syncService.enqueueUpsert({
                  id: s.id, uid: u.uid, subjectName: subjectNames.get(s.subjectId) ?? 'Unknown Subject',
                  minutes: s.durationMinutes, startAt: s.startAt, endAt: s.endAt, createdAt: s.createdAt,
                })
              }
              void syncService.flush()
            }
          } catch (e) {
            console.error('Error loading user data:', e)
          }
        } else {
          setProfile(null)
        }
        setIsLoading(false)
      })
    }).catch((e) => {
      console.error('Firebase initialisation failed:', e)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
      unsubAuth?.()
      if (unsubSyncRef.current) unsubSyncRef.current()
    }
  }, [watchAuth])
  const signIn = useCallback(async () => {
    const runtime = await getFirebase()
    if (!runtime) {
      throw new Error('Firebase is not configured. Set credentials in src/lib/firebase-config.ts')
    }
    const { auth, authApi } = runtime
    try {
      await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider())
      // Start watching auth state so the session is picked up (and the
      // uid persisted) without a page reload.
      setWatchAuth(true)
    } catch (e) {
      console.error('Sign-in failed:', e)
      throw e
    }
  }, [])
  const signOut = useCallback(async () => {
    const runtime = await getFirebase()
    if (!runtime) return
    await runtime.authApi.signOut(runtime.auth)
    setWatchAuth(false)
  }, [])
  const updateProfile = useCallback(
    async (patch: Partial<Pick<UserProfile, 'displayName'>>) => {
      const runtime = await getFirebase()
      if (!user || !runtime) return
      const { db, firestoreApi } = runtime
      const ref = firestoreApi.doc(db, 'users', user.uid)
      const now = isoNow()
      await firestoreApi.setDoc(
        ref,
        { ...patch, updatedAt: now, lastActiveAt: now },
        { merge: true }
      )
      setProfile((p) => (p ? { ...p, ...patch, updatedAt: now } : p))
    },
    [user]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isLoading,
      isConfigured: isFirebaseConfigured,
      signIn,
      signOut,
      updateProfile,
    }),
    [user, profile, isLoading, signIn, signOut, updateProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
