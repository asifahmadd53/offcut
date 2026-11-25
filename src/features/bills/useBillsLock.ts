import { create } from 'zustand'

const UNLOCK_MS = 10 * 60 * 1000 // after the PIN, Summary and Export stay open this long
const pinKey = (uid: string) => `offcut-bills-pin:${uid}`

async function hashPin(uid: string, pin: string): Promise<string> {
    const text = `${uid}:${pin}:offcut`
    if (!globalThis.crypto?.subtle) return btoa(text) // plain http while testing on a LAN
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

export function hasPin(uid: string): boolean {
    try {
        return !!localStorage.getItem(pinKey(uid))
    } catch {
        return false
    }
}

export async function setPin(uid: string, pin: string) {
    localStorage.setItem(pinKey(uid), await hashPin(uid, pin))
}

export async function checkPin(uid: string, pin: string): Promise<boolean> {
    try {
        return localStorage.getItem(pinKey(uid)) === (await hashPin(uid, pin))
    } catch {
        return false
    }
}

interface LockState {
    until: number // time in ms until which Summary and Export are open (0 = locked)
    unlock: () => void
    lock: () => void
}

// Memory only: a refresh always starts locked.
export const useBillsLock = create<LockState>((set) => ({
    until: 0,
    unlock: () => set({ until: Date.now() + UNLOCK_MS }),
    lock: () => set({ until: 0 }),
}))

export const isUnlocked = () => useBillsLock.getState().until > Date.now()