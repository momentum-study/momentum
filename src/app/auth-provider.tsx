// Auth context for cloud features (Firebase Auth).
// Exposes the current user, sign-in / sign-out actions, and loading state.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider, isFirebaseConfigured } from '../lib/firebase'
import { isoNow } from '../lib/utils'
import type { UserProfile } from '../domain/cloud-types'
import { syncService } from '../lib/sync-service'
import { db as localDb } from '../db/app-db'
import { pullSettings } from '../lib/settings-sync'
import { pullAllData } from '../lib/data-sync'
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

  // Subscribe to auth state changes
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setIsLoading(false)
      return
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) localStorage.setItem('momentum-cloud-uid', u.uid)
      else localStorage.removeItem('momentum-cloud-uid')
      if (u && db) {
        // Fetch or create the user's profile doc
        const ref = doc(db, 'users', u.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile)
          // Pull and sync settings
          const cloudPrefs = await pullSettings(u.uid)
          if (cloudPrefs) {
            localStorage.setItem('momentum-settings', JSON.stringify(cloudPrefs.settings))
            localStorage.setItem('momentum-dashboard-widgets', JSON.stringify(cloudPrefs.dashboardWidgets))
            localStorage.setItem('momentum-nav-prefs', JSON.stringify(cloudPrefs.navPrefs))
            window.location.reload()
          }
          // Pull all user data (focus areas, marks, habits, etc.) from cloud
          await pullAllData(u.uid)
        } else {
          // First sign-in — create a profile doc
          const now = isoNow()
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: u.displayName ?? u.email?.split('@')[0] ?? 'Anonymous',
            photoURL: u.photoURL ?? null,
            createdAt: now,
            updatedAt: now,
            lastActiveAt: now,
          }
          await setDoc(ref, newProfile)
          setProfile(newProfile)

          // Bulk sync existing sessions
          const allLocalSessions = await localDb.sessions.toArray()
          for (const s of allLocalSessions) {
            const subjectName = (await localDb.subjects.get(s.subjectId))?.name ?? 'Unknown Subject'
            syncService.enqueueUpsert({
              id: s.id,
              uid: u.uid,
              subjectName,
              minutes: s.durationMinutes,
              startAt: s.startAt,
              endAt: s.endAt,
              createdAt: s.createdAt,
            })
          }
          void syncService.flush()
        }
      } else {
        setProfile(null)
      }
      setIsLoading(false)
    })
    return unsub
  }, [])

  const signIn = useCallback(async () => {
    if (!auth) {
      throw new Error('Firebase is not configured. Set credentials in src/lib/firebase.ts')
    }
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      console.error('Sign-in failed:', e)
      throw e
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!auth) return
    await firebaseSignOut(auth)
  }, [])

  const updateProfile = useCallback(
    async (patch: Partial<Pick<UserProfile, 'displayName'>>) => {
      if (!user || !db) return
      const ref = doc(db, 'users', user.uid)
      const now = isoNow()
      await setDoc(
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
