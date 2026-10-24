// Generates the app icons from the KanjiVG strokes of 読 (CC BY-SA 3.0).
// Usage: pnpm add -D playwright-core && node scripts/make-icons.mjs <path-to-kanjivg-08aad.svg> (then pnpm remove playwright-core)
// (uses a local Chromium; set CHROME to its path)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(process.argv[2], 'utf8')
const paths = [...src.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1])
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

function svg({ padding, radius, bg = '#c0392b' }) {
  // KanjiVG viewBox is 109×109
  const size = 109 + padding * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${size} ${size}">
<rect x="${-padding}" y="${-padding}" width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
<g fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">
${paths.map((d) => `<path d="${d}"/>`).join('\n')}
</g></svg>`
}

mkdirSync(join(ROOT, 'public', 'icons'), { recursive: true })
const favicon = svg({ padding: 12, radius: 30 })
writeFileSync(join(ROOT, 'public', 'favicon.svg'), favicon)

const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage()
async function png(svgText, size, out) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace('<svg ', `<svg style="display:block" width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: out, omitBackground: true })
}
await png(svg({ padding: 12, radius: 30 }), 192, join(ROOT, 'public', 'icons', 'icon-192.png'))
await png(svg({ padding: 12, radius: 30 }), 512, join(ROOT, 'public', 'icons', 'icon-512.png'))
// maskable: full-bleed background, glyph inside the safe zone
await png(svg({ padding: 40, radius: 0 }), 512, join(ROOT, 'public', 'icons', 'maskable-512.png'))
await png(svg({ padding: 22, radius: 0 }), 180, join(ROOT, 'public', 'icons', 'apple-touch-icon.png'))
await browser.close()
console.log('icons written')
