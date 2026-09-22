import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { requireDb } from './firebase'
import type { CutDoc, Resolution, Settings } from './types'

/** Firestore does not accept undefined values, so strip them out. */
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const cutsCollection = (uid: string) => collection(requireDb(), 'shops', uid, 'cuts')
export const resolutionsCollection = (uid: string) =>
  collection(requireDb(), 'shops', uid, 'resolutions')
export const hiddenJobsCollection = (uid: string) =>
  collection(requireDb(), 'shops', uid, 'hiddenJobs')
export const settingsDoc = (uid: string) => doc(requireDb(), 'shops', uid, 'settings', 'main')

/**
 * Saves a record. The promise only finishes when the server has it, which can be days
 * later when the phone is offline. So callers must NOT wait for it: the local copy is
 * already saved and shown immediately.
 */
export function saveCut(uid: string, cut: Omit<CutDoc, 'syncedAt'>): void {
  setDoc(doc(requireDb(), 'shops', uid, 'cuts', cut.id), {
    ...clean(cut),
    syncedAt: serverTimestamp(),
  }).catch((err) => console.error('Could not sync cut', err))
}

export function saveResolution(uid: string, cutId: string, choice: Resolution): void {
  setDoc(doc(requireDb(), 'shops', uid, 'resolutions', cutId), {
    choice,
    at: Date.now(),
  }).catch((err) => console.error('Could not sync answer', err))
}

/**
 * Marks a job as removed from the carpenter's job list. The underlying cut record is
 * never edited or deleted (R8/R9) — this only hides it from view, so its leftovers
 * (already saved to stock) are completely unaffected.
 */
export function saveHiddenJob(uid: string, cutId: string): void {
  setDoc(doc(requireDb(), 'shops', uid, 'hiddenJobs', cutId), {
    at: Date.now(),
  }).catch((err) => console.error('Could not sync hide', err))
}

export function saveSettings(uid: string, settings: Settings): void {
  setDoc(settingsDoc(uid), clean(settings)).catch((err) =>
    console.error('Could not sync settings', err),
  )
}
