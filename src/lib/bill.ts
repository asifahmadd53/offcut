export const USUAL_TAPE_RATE = 35
export const USUAL_CUT_RATE = 300

const round2 = (n: number) => Math.round(n * 100) / 100

/** Empty or unreadable text counts as 0. */
export function num(text: string): number {
  const n = parseFloat(text)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface BillInput {
  feet: string
  tapeRate: string
  sheets: string
  cutRate: string
}

export function calcBill(i: BillInput) {
  const feet = num(i.feet)
  const tapeRate = num(i.tapeRate)
  const sheets = num(i.sheets)
  const cutRate = num(i.cutRate)
  const tape = round2(feet * tapeRate)
  const cutting = round2(sheets * cutRate)
  return { feet, tapeRate, sheets, cutRate, tape, cutting, total: round2(tape + cutting) }
}

export const plain = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
export const rs = (n: number) => `Rs ${plain(n)}`