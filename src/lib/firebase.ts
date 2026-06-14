// Firebase configuration and initialization
// To enable cloud features, create a Firebase project at https://console.firebase.google.com/
// and replace the placeholder values below with your project's config.
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Placeholder config — replace with your Firebase project credentials.
// Cloud features are disabled until valid credentials are provided.
const firebaseConfig = {
  apiKey: 'AIzaSyAzbn-vgYH9evYeSHM4Esr_B2DF_FFW5sU',
  authDomain: 'momentum-78333.firebaseapp.com',
  projectId: 'momentum-78333',
  storageBucket: 'momentum-78333.firebasestorage.app',
  messagingSenderId: '134232442359',
  appId: '1:134232442359:web:1c2af4ebbe3e8818f99af2',
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
