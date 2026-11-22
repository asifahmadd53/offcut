import { create } from 'zustand'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { requireAuth } from '@/lib/firebase'

const KEY = 'offcut-account'

export interface Account {
    bank: string
    title: string
    number: string
}

const EMPTY: Account = { bank: '', title: '', number: '' }

function load(): Account {
    try {
        const raw = localStorage.getItem(KEY)
        return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
    } catch {
        return EMPTY
    }
}

interface AccountState {
    account: Account
    save: (next: Account) => void
}

export const useAccount = create<AccountState>((set) => ({
    account: load(),
    save: (next) => {
        const clean = {
            bank: next.bank.trim(),
            title: next.title.trim(),
            number: next.number.trim(),
        }
        set({ account: clean })
        try {
            localStorage.setItem(KEY, JSON.stringify(clean))
        } catch {
            /* storage blocked, ignore */
        }
    },
}))

/**
 * ✏️ Adjust this to your login system. It must return true only if the password
 * is the one the user logged in with. Example for Supabase:
 */
// import { supabase } from '@/lib/supabase'
export async function verifyPassword(email: string, password: string): Promise<boolean> {
    const user = requireAuth().currentUser
    if (!user) throw new Error('Not signed in')
    try {
        // Checks the password against Firebase without creating a new session.
        await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(email || user.email || '', password),
        )
        return true
    } catch (e) {
        const code = (e as { code?: string })?.code ?? ''
        if (
            code === 'auth/wrong-password' ||
            code === 'auth/invalid-credential' ||
            code === 'auth/invalid-login-credentials'
        ) {
            return false // wrong password is a normal "false", not a crash
        }
        throw e // network, too-many-requests, etc.
    }
}