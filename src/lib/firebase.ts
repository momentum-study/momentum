// Firebase configuration and initialization
// To enable cloud features, create a Firebase project at https://console.firebase.google.com/
// and replace the placeholder values below with your project's config.
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Placeholder config — replace with your Firebase project credentials.
// Cloud features are disabled until valid credentials are provided.
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
}

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_')

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
  } catch (e) {
    console.error('Firebase initialization failed:', e)
  }
}

export const googleProvider = new GoogleAuthProvider()
export { app, auth, db }
