/**
 * Thin re-export: the label-choice logic now lives in diagramLayout.ts alongside the rest
 * of the technical-drawing geometry. Kept here so existing imports and labelChoice.test.ts
 * keep working unchanged.
 */
export { badgedLeftovers, chooseFreeLabel } from './diagramLayout'
export type { FreeLabelChoice, FreeLabelKind } from './diagramLayout'
