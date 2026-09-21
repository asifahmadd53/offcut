// Regenerates public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png from
// favicon.svg. `sharp` isn't a project dependency (it's a one-off rasterizer, not needed
// at build/runtime) - install it temporarily to run this: `npm install --no-save sharp`,
// then `node scripts/generate-icons.mjs`, then `npm uninstall sharp`.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.join(__dirname, '..', 'public', 'icons')
const svgPath = path.join(iconsDir, 'favicon.svg')
const svg = readFileSync(svgPath)

async function main() {
  // Plain square icons: the brand SVG already has its own rounded-rect background,
  // rendered straight at each required size.
  await sharp(svg, { density: 384 }).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'))
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'))

  // Maskable: Android crops a maskable icon to its own shape (circle, squircle, etc.),
  // safely keeping only the inner ~80% - pad the artwork onto a full-bleed brand-colour
  // canvas so nothing important sits in the corners that get cut off.
  const brandBg = { r: 0xfb, g: 0x92, b: 0x3c, alpha: 1 }
  const inner = Math.round(512 * 0.7)
  const innerPng = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: 512, height: 512, channels: 4, background: brandBg } })
    .composite([{ input: innerPng, gravity: 'center' }])
    .png()
    .toFile(path.join(iconsDir, 'maskable-512.png'))

  // Apple touch icon: iOS ignores alpha transparency and can render it as solid black,
  // so flatten onto the same brand background at the classic 180x180 size, no rounding
  // (iOS applies its own corner mask).
  await sharp(svg, { density: 384 })
    .resize(180, 180)
    .flatten({ background: brandBg })
    .png()
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'))

  console.log('Generated icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png')
}

main()
