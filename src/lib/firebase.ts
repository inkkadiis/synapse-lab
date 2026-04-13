import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBP45OKiH8rYkcFQ8nG4W2TWNy7sPAr9_w',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'gen-lang-client-0963225443.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'gen-lang-client-0963225443',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
    'gen-lang-client-0963225443.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '563388372514',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ?? '1:563388372514:web:708fca0ab92df724c49c7b',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
};

const firestoreDatabaseId =
  import.meta.env.VITE_FIRESTORE_DATABASE_ID ?? 'ai-studio-1c947888-b7f0-4c0b-b608-963e314bda3e';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
