import { initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

const app = isFirebaseConfigured ? initializeApp(config) : null

const authInstance: Auth | null = app ? getAuth(app) : null

function createDb(): Firestore | null {
  if (!app) return null
  try {
    // Saves everything on the phone first and syncs when internet is back.
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    // Some private browser modes block on-device storage. Fall back so the app still opens.
    return initializeFirestore(app, { localCache: memoryLocalCache() })
  }
}

const dbInstance = createDb()

export function requireAuth(): Auth {
  if (!authInstance) throw new Error('Firebase is not configured')
  return authInstance
}

export function requireDb(): Firestore {
  if (!dbInstance) throw new Error('Firebase is not configured')
  return dbInstance
}
