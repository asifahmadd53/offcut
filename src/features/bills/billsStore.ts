import { getAuth, onAuthStateChanged } from 'firebase/auth'
import {
    collection,
    doc,
    getDocFromCache,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    updateDoc,
    where,
    type QueryConstraint,
    type UpdateData,
    type Unsubscribe,
} from 'firebase/firestore'
import type { BillLine } from '@/components/BillShareDialog'
import { statusOf, type SavedBill, type Status } from './types'
export interface BillInput {
    client: string
    lines: BillLine[]
    tapeTotal: number
    cutting: number
    total: number
    fare?: number
    paid?: boolean
    createdAt?: number
}

function currentUid(): string {
    const user = getAuth().currentUser
    if (!user) throw new Error('not-signed-in')
    return user.uid
}

/** Saves a new bill as Unpaid. It is stored on this device at once and uploads by itself when online. */
export async function saveBill(input: BillInput): Promise<string> {
    const uid = currentUid()
    const ref = doc(collection(getFirestore(), 'shops', uid, 'bills'))
    // Not awaited: offline, that promise only finishes once the server has the bill.
    const now = input.createdAt ?? Date.now()
    setDoc(ref, {
        client: input.client,
        createdAt: now,
        lines: input.lines,
        tapeTotal: input.tapeTotal,
        cutting: input.cutting,
        fare: input.fare ?? 0,
        total: input.total,
        status: input.paid ? 'paid' : 'unpaid',
        paidAt: input.paid ? now : null,
        hidden: false,
    }).catch((err) => console.error('Bill upload failed', err))
    return ref.id
}

async function patchBill(
    id: string,
    patch: UpdateData<SavedBill>,
    guard?: (current: SavedBill) => void,
): Promise<void> {
    const uid = currentUid()
    const ref = doc(getFirestore(), 'shops', uid, 'bills', id)
    if (guard) {
        // Checked against the copy on this device, so it is instant and works offline too.
        const snap = await getDocFromCache(ref).catch(() => null)
        if (snap?.exists()) guard({ ...(snap.data() as Omit<SavedBill, 'id'>), id })
    }
    // Not awaited: it is stored on this device at once and uploads in the background.
    updateDoc(ref, patch).catch((err) => console.error('Bill update failed', err))
}

/** Changes the content of a bill that was just saved. Refuses if it was removed or already marked paid. */
export function updateBillContent(id: string, input: BillInput): Promise<void> {
    return patchBill(
        id,
        {
            client: input.client,
            lines: input.lines,
            tapeTotal: input.tapeTotal,
            cutting: input.cutting,
            fare: input.fare ?? 0,
            total: input.total,
        },
        (current) => {
            if (current.hidden) throw new Error('missing')
            if (statusOf(current) === 'paid') throw new Error('locked')
        },
    )
}

export function setBillStatus(id: string, status: Status): Promise<void> {
    return patchBill(id, { status, paidAt: status === 'paid' ? Date.now() : null })
}

/** Removing hides the bill. Nothing is erased from the database. */
export function hideBill(id: string): Promise<void> {
    return patchBill(id, { hidden: true })
}

/** Live list of the shop's bills for the given dates, newest first. Returns a function that stops listening. */
export function watchBills(
    onData: (bills: SavedBill[]) => void,
    onError: (err: Error) => void,
    range?: { from: number | null; toExclusive: number | null },
): Unsubscribe {
    let stopSnapshot: Unsubscribe = () => { }
    const stopAuth = onAuthStateChanged(getAuth(), (user) => {
        stopSnapshot()
        if (!user) {
            onData([])
            return
        }
        const c: QueryConstraint[] = []
        if (range?.from != null) c.push(where('createdAt', '>=', range.from))
        if (range?.toExclusive != null) c.push(where('createdAt', '<', range.toExclusive))
        const q = query(
            collection(getFirestore(), 'shops', user.uid, 'bills'),
            ...c,
            orderBy('createdAt', 'desc'),
            limit(1000),
        )
        stopSnapshot = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (snap) =>
                onData(
                    snap.docs.map((d) => ({
                        ...(d.data() as Omit<SavedBill, 'id'>),
                        id: d.id,
                        pending: d.metadata.hasPendingWrites,
                    })),
                ),
            onError,
        )
    })
    return () => {
        stopAuth()
        stopSnapshot()
    }
}

/** Live view of one bill. Calls onData(null) if it does not exist. */
export function watchBill(
    id: string,
    onData: (bill: SavedBill | null) => void,
    onError: (err: Error) => void,
): Unsubscribe {
    let stopSnapshot: Unsubscribe = () => { }
    const stopAuth = onAuthStateChanged(getAuth(), (user) => {
        stopSnapshot()
        if (!user) {
            onData(null)
            return
        }
        stopSnapshot = onSnapshot(
            doc(getFirestore(), 'shops', user.uid, 'bills', id),
            { includeMetadataChanges: true },
            (snap) =>
                onData(
                    snap.exists()
                        ? {
                            ...(snap.data() as Omit<SavedBill, 'id'>),
                            id: snap.id,
                            pending: snap.metadata.hasPendingWrites,
                        }
                        : null,
                ),
            onError,
        )
    })
    return () => {
        stopAuth()
        stopSnapshot()
    }
}