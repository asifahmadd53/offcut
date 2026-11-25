import { useEffect, useSyncExternalStore } from 'react'
import { rs } from '@/lib/bill'

const IDLE_MS = 600_000 // amounts hide again after 2 minutes with no activity
const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

// Kept in memory only, so a refresh always hides amounts again.
let unlocked = false
let lastActive = 0
let mounted = 0
let idleTimer: ReturnType<typeof setInterval> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())
const onActivity = () => {
    lastActive = Date.now()
}

/** What is shown in place of a hidden amount. */
export const HIDDEN = '••••'

/** Formats an amount, or hides it while locked. */
export const money = (isUnlocked: boolean, n: number) => (isUnlocked ? rs(n) : `Rs ${HIDDEN}`)

export function unlockBills() {
    if (unlocked) return
    unlocked = true
    lastActive = Date.now()
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    idleTimer = setInterval(() => {
        if (Date.now() - lastActive >= IDLE_MS) lockBills()
    }, 1000)
    emit()
}

export function lockBills() {
    if (!unlocked) return
    unlocked = false
    EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
    if (idleTimer) clearInterval(idleTimer)
    idleTimer = null
    emit()
}

export function secondsLeft(): number {
    return Math.max(0, Math.ceil((IDLE_MS - (Date.now() - lastActive)) / 1000))
}

/**
 * Use in every Bills page. Returns whether amounts are visible.
 * The pages themselves are always open; only the amounts are hidden while locked.
 * Leaving the Bills section hides amounts again. Moving between the list and a bill does not,
 * because the next page mounts within half a second and cancels the lock.
 */
export function useBillsLock(): boolean {
    const isUnlocked = useSyncExternalStore(
        (cb) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        },
        () => unlocked,
    )

    useEffect(() => {
        mounted++
        if (leaveTimer) {
            clearTimeout(leaveTimer)
            leaveTimer = null
        }
        return () => {
            mounted--
            if (mounted === 0) {
                leaveTimer = setTimeout(() => {
                    if (mounted === 0) lockBills()
                }, 500)
            }
        }
    }, [])

    return isUnlocked
}