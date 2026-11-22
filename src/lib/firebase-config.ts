// Firebase project credentials — deliberately SDK-free.
//
// Startup perf: the boot path only needs to know *whether* cloud features are
// configured. Importing `firebase.ts` for that flag would drag the whole
// firebase/app + auth + firestore SDK into the initial bundle, so the flag and
// the config live here and `firebase.ts` (the SDK entry point) is loaded on
// demand after first paint.
//
// To enable cloud features, create a Firebase project at
// https://console.firebase.google.com/ and replace the placeholder values.
// Cloud features stay disabled until valid credentials are provided.
export const firebaseConfig = {
  apiKey: 'AIzaSyAzbn-vgYH9evYeSHM4Esr_B2DF_FFW5sU',
  authDomain: 'momentum-78333.firebaseapp.com',
  projectId: 'momentum-78333',
  storageBucket: 'momentum-78333.firebasestorage.app',
  messagingSenderId: '134232442359',
  appId: '1:134232442359:web:1c2af4ebbe3e8818f99af2',
}

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_')