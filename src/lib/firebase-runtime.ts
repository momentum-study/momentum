// Firebase runtime — the single owner of the Firebase SDK.
//
// This module statically imports the SDK, so it must only ever be reached
// through a dynamic import of a cloud module (data-sync, group-service,
// sync-service, settings-sync, cloud-backup) or via `firebase.ts`. Momentum
// is local-first: the app boots and renders entirely from IndexedDB without
// ever loading this file.
//
// The project config and the "is it configured?" flag live in
// `firebase-config.ts`, which stays SDK-free so that the boot path can read
// the flag without pulling in the SDK.
//
// Named imports are used deliberately: a namespace import (`import * as`)
// forces the whole module into the chunk and defeats tree-shaking, which
// made the SDK bundle ~220 kB larger than necessary.
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore'
import { firebaseConfig, isFirebaseConfigured } from './firebase-config'

export interface FirebaseRuntime {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  googleProvider: GoogleAuthProvider
  /** The auth operations the app actually uses. */
  authApi: {
    onAuthStateChanged: typeof onAuthStateChanged
    signInWithPopup: typeof signInWithPopup
    signOut: typeof signOut
    GoogleAuthProvider: typeof GoogleAuthProvider
  }
  /** The Firestore document operations the app actually uses. */
  firestoreApi: {
    doc: typeof doc
    getDoc: typeof getDoc
    setDoc: typeof setDoc
  }
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
  } catch (e) {
    console.error('Firebase initialisation failed:', e)
  }
}

export const googleProvider = new GoogleAuthProvider()

/** The initialised handles, or null when Firebase is unconfigured or failed. */
export function getFirebaseRuntime(): FirebaseRuntime | null {
  if (!isFirebaseConfigured || !app || !auth || !db) return null
  return {
    app,
    auth,
    db,
    googleProvider,
    authApi: { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider },
    firestoreApi: { doc, getDoc, setDoc },
  }
}

export { app, auth, db, isFirebaseConfigured, firebaseConfig }
