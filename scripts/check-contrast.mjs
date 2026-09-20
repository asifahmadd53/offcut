#!/usr/bin/env node
// Computes WCAG relative-luminance contrast ratios for every meaningful
// foreground/background token pair actually used together in the app, in both the
// light (:root) and dark (@media prefers-color-scheme: dark) hex sets parsed directly
// out of src/index.css so this check can never silently drift from the real tokens.
// Fails (non-zero exit, prints the failing pairs) if a normal-text pair is under 4.5:1
// or a large-text/UI-border pair is under 3:1. See CLAUDE.md C13.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cssPath = path.resolve(__dirname, '../src/index.css')
const css = readFileSync(cssPath, 'utf8')

function parseBlock(source) {
  const vars = {}
  const re = /--([\w-]+):\s*(#[0-9a-fA-F]{6});/g
  let m
  while ((m = re.exec(source))) vars[m[1]] = m[2]
  return vars
}

// Light tokens live in the first :root { ... } block; dark tokens live inside the
// @media (prefers-color-scheme: dark) { :root { ... } } block.
const rootMatch = css.match(/:root\s*{([^}]*)}/)
const darkMatch = css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/)
if (!rootMatch || !darkMatch) {
  console.error('Could not locate :root token blocks in src/index.css')
  process.exit(1)
}
const light = parseBlock(rootMatch[1])
const dark = { ...light, ...parseBlock(darkMatch[1]) }

function luminance(hex) {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(hexA, hexB) {
  const l1 = luminance(hexA)
  const l2 = luminance(hexB)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// [label, fg var, bg var, kind] — kind 'text' needs >=4.5:1, 'large'/'ui' needs >=3:1.
const pairs = [
  ['foreground on background', 'foreground', 'background', 'text'],
  ['muted-foreground on background', 'muted-foreground', 'background', 'text'],
  ['foreground on card', 'foreground', 'card', 'text'],
  ['muted-foreground on muted', 'muted-foreground', 'muted', 'text'],
  ['primary-foreground on primary', 'primary-foreground', 'primary', 'text'],
  ['brand-fg on brand', 'brand-fg', 'brand', 'text'],
  ['brand-ink on brand-tint', 'brand-ink', 'brand-tint', 'text'],
  ['on-dark-primary-foreground on on-dark-primary', 'on-dark-primary-foreground', 'on-dark-primary', 'text'],
  ['accent-text on accent-bg', 'accent-text', 'accent-bg', 'text'],
  ['success-text on success-bg', 'success-text', 'success-bg', 'text'],
  ['warning-text on warning-bg', 'warning-text', 'warning-bg', 'text'],
  ['danger-text on danger-bg', 'danger-text', 'danger-bg', 'text'],
  // border-strong is used for input/button outlines (a real UI component boundary,
  // WCAG 1.4.11 non-text contrast target 3:1) — plain hairline `border` dividers between
  // rows/cards are deliberately NOT included here: they're decorative, not the only means
  // of conveying a boundary (padding/background also separate those regions), so WCAG's
  // non-text-contrast criterion does not apply to them.
  ['border-strong on background', 'border-strong', 'background', 'ui'],
]

const THRESHOLD = { text: 4.5, large: 3, ui: 3 }

function run(themeName, vars) {
  const rows = []
  let failed = false
  for (const [label, fgKey, bgKey, kind] of pairs) {
    const fg = vars[fgKey]
    const bg = vars[bgKey]
    if (!fg || !bg) {
      rows.push({ label, ratio: null, ok: false, note: `missing token ${fgKey} or ${bgKey}` })
      failed = true
      continue
    }
    const ratio = contrast(fg, bg)
    const need = THRESHOLD[kind]
    const ok = ratio >= need
    if (!ok) failed = true
    rows.push({ label, ratio, need, ok })
  }
  console.log(`\n=== ${themeName} ===`)
  for (const r of rows) {
    const status = r.ok ? 'PASS' : 'FAIL'
    const ratioStr = r.ratio != null ? `${r.ratio.toFixed(2)}:1` : 'n/a'
    console.log(`  [${status}] ${r.label.padEnd(40)} ${ratioStr}${r.note ? '  ' + r.note : ''}`)
  }
  return failed
}

const lightFailed = run('Light', light)
const darkFailed = run('Dark', dark)

if (lightFailed || darkFailed) {
  console.error('\nContrast check FAILED — see FAIL rows above.')
  process.exit(1)
}
console.log('\nAll token pairs pass WCAG contrast minimums.')
