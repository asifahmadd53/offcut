import { describe, expect, it } from 'vitest'
import { calcBill } from './bill'

describe('calcBill', () => {
    it('100 ft at 35 is 3500', () => {
        expect(calcBill({ feet: '100', tapeRate: '35', sheets: '', cutRate: '300' }).tape).toBe(3500)
    })
    it('a bargained rate changes the bill', () => {
        expect(calcBill({ feet: '100', tapeRate: '32', sheets: '', cutRate: '300' }).tape).toBe(3200)
    })
    it('6 sheets at 300 plus 100 ft at 35 is 5300', () => {
        const b = calcBill({ feet: '100', tapeRate: '35', sheets: '6', cutRate: '300' })
        expect(b.cutting).toBe(1800)
        expect(b.total).toBe(5300)
    })
    it('empty or unreadable input counts as zero', () => {
        expect(calcBill({ feet: 'abc', tapeRate: '35', sheets: '', cutRate: '300' }).total).toBe(0)
    })
    it('does not show floating point noise', () => {
        expect(calcBill({ feet: '215.8', tapeRate: '35', sheets: '', cutRate: '300' }).tape).toBe(7553)
    })
})