import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, 'public', 'icons')
mkdirSync(iconsDir, { recursive: true })

// Full icon SVG with opaque brand background, centered glyph scaled to fill
function makeSvg(size) {
  const pad = size * 0.14
  const inner = size - pad * 2
  const s = inner / 32  // scale factor from 32x32 viewBox

  // Glyph coordinates scaled
  const cx = pad + s * 20
  const cy = pad + s * 13
  const r  = s * 5.25
  const sw = s * 1.75

  // Hill path, scaled
  const x2  = pad + s * 2,  y2  = pad + s * 26
  const qx1 = pad + s * 10, qy1 = pad + s * 26
  const qx2 = pad + s * 14, qy2 = pad + s * 16
  const qx3 = pad + s * 18, qy3 = pad + s * 6
  const qx4 = pad + s * 22, qy4 = pad + s * 16
  const qx5 = pad + s * 26, qy5 = pad + s * 26
  const x3  = pad + s * 30, y3  = pad + s * 26

  // Mask points for the sun to hide behind the hill
  const mx1 = pad + s * -2, my1 = pad + s * -2
  const mw = size + s * 4, mh = size + s * 4
  const mvb = size + s * 8

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#080d1a"/>
  <defs>
    <mask id="hill-mask" maskUnits="userSpaceOnUse">
      <rect x="${mx1}" y="${my1}" width="${mw}" height="${mh}" fill="white"/>
      <path d="${x2} ${y2} Q${qx1} ${qy1} ${qx2} ${qy2} Q${qx3} ${qy3} ${qx4} ${qy4} Q${qx5} ${qy5} ${x3} ${y3} V${mvb} H${mx1} Z" fill="black"/>
    </mask>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fbbf24" mask="url(#hill-mask)"/>
  <path d="M${x2} ${y2} Q${qx1} ${qy1} ${qx2} ${qy2} Q${qx3} ${qy3} ${qx4} ${qy4} Q${qx5} ${qy5} ${x3} ${y3}"
    stroke="#0ea5e9" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`
}

const sizes = [180, 192, 512]

for (const size of sizes) {
  const svg = makeSvg(size)
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const data = resvg.render()
  const png = data.asPng()
  writeFileSync(join(iconsDir, `icon-${size}.png`), png)
  console.log(`generated icon-${size}.png (${png.byteLength} bytes)`)
}
