import { create } from 'zustand'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { isFirebaseConfigured, requireAuth } from '@/lib/firebase'

interface AuthState {
  status: 'loading' | 'in' | 'out'
  uid: string | null
  email: string | null
  /** Starts listening to the login state. Returns the stop function. */
  init: () => () => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  uid: null,
  email: null,
  init: () => {
    if (!isFirebaseConfigured) {
      set({ status: 'out' })
      return () => {}
    }
    // Works offline too: the login is remembered on the phone.
    return onAuthStateChanged(requireAuth(), (user) => {
      set(
        user
          ? { status: 'in', uid: user.uid, email: user.email }
          : { status: 'out', uid: null, email: null },
      )
    })
  },
  login: async (email, password) => {
    await signInWithEmailAndPassword(requireAuth(), email.trim(), password)
  },
  register: async (email, password) => {
    await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)
  },
  logout: async () => {
    await signOut(requireAuth())
  },
}))

/** Turns Firebase error codes into one plain sentence. */
export function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Email or password is wrong. Check them and try again.'
    case 'auth/email-already-in-use':
      return 'That email already has an account. Log in instead.'
    case 'auth/weak-password':
      return 'Use a password with at least 6 characters.'
    case 'auth/network-request-failed':
      return 'No internet. Connect once to log in. After that, the app works offline.'
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes and try again.'
    default:
      return 'Could not log in. Check your internet and try again.'
  }
}
