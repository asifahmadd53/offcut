/**
 * Thin re-export: the label-choice logic lives in diagramLayout.ts alongside the rest of
 * the diagram geometry. Kept here so existing imports keep working unchanged.
 */
export { chooseBlockLabel, chooseAllLabels, sizesList, everyBlockHasASize } from './diagramLayout'
export type { BlockLabelPlan, LabelKind, SizesListEntry, SizesGroupKey } from './diagramLayout'
