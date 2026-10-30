import type { PackOptions } from './packer'
import { DEFAULT_LAYOUT, type LayoutMethod, type SheetLayout, type Settings } from './types'

/** The layout a job is cut with: its own choice if it made one, otherwise the Settings defaults. */
export function effectiveLayout(settings: Settings, override?: SheetLayout | null): SheetLayout {
  if (override) return override
  return {
    method: settings.layoutMethod ?? DEFAULT_LAYOUT.method,
    levels: settings.layoutLevels ?? DEFAULT_LAYOUT.levels,
    grain: settings.grain ?? DEFAULT_LAYOUT.grain,
  }
}

/** The default layout of a job, as the Settings page stores it. */
export const layoutOfSettings = (settings: Settings): SheetLayout => effectiveLayout(settings, null)

/** What the planner needs to know about the sheets and the cutting, from Settings and the job's layout. */
export function packOptionsFor(settings: Settings, layout: SheetLayout): Pick<PackOptions, 'sheetW' | 'sheetH' | 'kerf' | 'minLeftover' | 'grain' | 'layout' | 'levels'> {
  return {
    sheetW: settings.sheetW,
    sheetH: settings.sheetH,
    kerf: settings.kerfOn ? settings.kerfSize : 0,
    minLeftover: settings.minLeftover,
    grain: layout.grain,
    layout: layout.method,
    levels: layout.levels,
  }
}

export const sameLayout = (a: SheetLayout, b: SheetLayout) => a.method === b.method && a.levels === b.levels && a.grain === b.grain

/** Whether a layout is the plain one (any edge-to-edge layout, no grain): nothing worth recording or announcing. */
export const isPlainLayout = (l: SheetLayout) => l.method === 'normal' && !l.grain

export const METHOD_NAME: Record<LayoutMethod, string> = {
  normal: 'Normal',
  length: 'First cut along the length',
  width: 'First cut along the width',
}

/** A short plain-words line for a layout, e.g. "Grain top to bottom · first cut along the length, 3 rounds". */
export function layoutSummary(l: SheetLayout): string {
  const grain = l.grain ? 'Grain top to bottom (pieces never turned)' : 'No grain'
  const method =
    l.method === 'normal'
      ? 'Normal cutting'
      : `${METHOD_NAME[l.method]}, ${l.levels} rounds`
  return `${grain} · ${method}`
}
