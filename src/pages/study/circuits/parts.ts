// SVG drawers for the Arduino study circuits, Tinkercad-Circuits style: top-down, flat colours with a
// board-thickness edge, soft shadows and glossy highlights. Everything returns SVG strings (trusted,
// generated from constants), so no user input ever reaches innerHTML.
//
// Units: 1 mm = 5 SVG units, so the 2.54 mm header/breadboard pitch P = 12.7.

export type Pt = [number, number]
export const P = 12.7
export const UNO_W = 343
export const UNO_H = 267
export const BB_W = 22 * 2 + 29 * P // 412.3
export const BB_H = 232

export type K = (name: string) => string

export const WIRE_COLORS: Record<string, [string, string]> = {
  red: ['#e0302f', '#8e1414'],
  black: ['#3b3b42', '#101013'],
  orange: ['#f39a2b', '#a65a07'],
  green: ['#34b04f', '#17692a'],
  yellow: ['#f2cf2c', '#9b7d08'],
  blue: ['#3b82e0', '#1a4a98'],
  brown: ['#8a5a2c', '#47290e'],
  purple: ['#8e5bd6', '#4b2a8c'],
}

const n2 = (n: number) => Math.round(n * 100) / 100

/** Gradients and filters shared by every layer of one scene (defined once, in the base layer). */
export function sharedDefs(k: K): string {
  const lin = (id: string, x2: number, y2: number, stops: Array<[number, string]>) =>
    `<linearGradient id="${k(id)}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`
  const rad = (id: string, stops: Array<[number, string, number?]>, cx = 0.5, cy = 0.5, r = 0.5) =>
    `<radialGradient id="${k(id)}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`
  return `<defs>
${lin('pcb', 0, 1, [[0, '#17a8b5'], [1, '#09717d']])}
${lin('metal', 1, 0, [[0, '#f7f8fa'], [0.35, '#b8bec7'], [0.6, '#eef0f3'], [1, '#98a0ab']])}
${lin('metalv', 0, 1, [[0, '#f4f5f7'], [0.5, '#bcc2ca'], [1, '#8d95a0']])}
${lin('black', 0, 1, [[0, '#45454c'], [1, '#17171b']])}
${lin('bb', 0, 1, [[0, '#f6f4ee'], [1, '#dedbd0']])}
${lin('chan', 0, 1, [[0, '#b9b6aa'], [0.5, '#cfccc0'], [1, '#b9b6aa']])}
${lin('blue', 0, 1, [[0, '#2a7fd6'], [1, '#1456a6']])}
${lin('hcb', 0, 1, [[0, '#2f7ad0'], [1, '#1b56a4']])}
${rad('knob', [[0, '#f4f4f6'], [0.7, '#c4c8cf'], [1, '#8f96a1']], 0.38, 0.32, 0.8)}
${rad('dome', [[0, '#ff9c9c'], [0.55, '#d3262c'], [1, '#7a0f14']], 0.38, 0.32, 0.85)}
${rad('domeOn', [[0, '#fff7e6'], [0.45, '#ff5d5d'], [1, '#e2161e']], 0.4, 0.35, 0.8)}
${rad('halo', [[0, '#ff4040', 0.95], [0.4, '#ff3030', 0.45], [1, '#ff2020', 0]])}
${rad('cap', [[0, '#7aa2e6'], [0.7, '#3f6fc4'], [1, '#27478e']], 0.4, 0.3, 0.8)}
${rad('ring', [[0, '#d7dce3'], [0.62, '#aeb5bf'], [0.7, '#f2f4f7'], [1, '#8a919c']])}
${rad('mesh', [[0, '#2b2d33'], [1, '#101114']])}
${rad('buz', [[0, '#4a4a52'], [0.6, '#26262b'], [1, '#0e0e11']], 0.4, 0.32, 0.8)}
${rad('horn', [[0, '#ffffff'], [1, '#d9dde3']], 0.4, 0.3, 0.9)}
<filter id="${k('sh')}" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".38"/></filter>
<filter id="${k('shs')}" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000" flood-opacity=".4"/></filter>
<filter id="${k('blur')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>`
}

/* ------------------------------------------------------------------ Arduino UNO R3 */

interface UnoPin { x: number; y: number; label: string; edge: 'top' | 'bottom' }

const UNO_PINS: Record<string, UnoPin> = {}
;(() => {
  const top = 16
  const bot = UNO_H - 16
  for (let n = 0; n <= 7; n++) UNO_PINS[`D${n}`] = { x: 322 - n * P, y: top, edge: 'top', label: [3, 5, 6].includes(n) ? `~${n}` : String(n) }
  for (let n = 8; n <= 13; n++) UNO_PINS[`D${n}`] = { x: 212.8 - (n - 8) * P, y: top, edge: 'top', label: [9, 10, 11].includes(n) ? `~${n}` : String(n) }
  ;[['GND', 136.6, 'GND'], ['AREF', 123.9, 'AREF'], ['SDA', 111.2, 'SDA'], ['SCL', 98.5, 'SCL']].forEach(([n, x, l]) => { UNO_PINS[n as string] = { x: x as number, y: top, edge: 'top', label: l as string } })
  ;[['NC', 'NC'], ['IOREF', 'IOREF'], ['RESET', 'RST'], ['3V3', '3.3V'], ['5V', '5V'], ['GND1', 'GND'], ['GND2', 'GND'], ['VIN', 'VIN']].forEach(([n, l], i) => {
    UNO_PINS[n] = { x: 95 + i * P, y: bot, edge: 'bottom', label: l }
  })
  for (let i = 0; i <= 5; i++) UNO_PINS[`A${i}`] = { x: 204.2 + i * P, y: bot, edge: 'bottom', label: `A${i}` }
})()

export const UNO_PIN_NAMES = Object.keys(UNO_PINS)

/** Pin position in scene coordinates. The board is always drawn rotated 180° (USB on the right): its digital header then faces the parts below it. */
export function unoPin(ox: number, oy: number, name: string): Pt {
  const p = UNO_PINS[name]
  if (!p) throw new Error(`unknown UNO pin ${name}`)
  return [n2(ox + UNO_W - p.x), n2(oy + UNO_H - p.y)]
}

function header(xs: number[], y: number): string {
  const x0 = Math.min(...xs) - 6.6
  const w = Math.max(...xs) - Math.min(...xs) + 13.2
  return `<rect x="${n2(x0)}" y="${y - 8}" width="${n2(w)}" height="16" rx="1.6" fill="url(#__black)" stroke="#0a0a0c" stroke-width=".6"/>` +
    xs.map((x) => `<rect x="${n2(x - 3.4)}" y="${y - 3.4}" width="6.8" height="6.8" rx="1" fill="#050506" stroke="#55555e" stroke-width=".5"/>`).join('')
}

export function uno(k: K, ox: number, oy: number, used: Record<string, string> = {}): string {
  const W = UNO_W
  const H = UNO_H
  const cx = W / 2
  const cy = H / 2
  const g = (s: string) => s.replace(/__(\w+)/g, (_m, id) => k(id))
  const pins = Object.entries(UNO_PINS)
  const xsOf = (pred: (n: string) => boolean, edge: 'top' | 'bottom') => pins.filter(([n, p]) => p.edge === edge && pred(n)).map(([, p]) => p.x)
  const isD1 = (n: string) => /^D(8|9|1[0-3])$|^(GND|AREF|SDA|SCL)$/.test(n)
  const isD2 = (n: string) => /^D[0-7]$/.test(n)
  const isPow = (n: string) => !/^A\d$/.test(n)
  const art = g(`
<g filter="url(#__sh)">
  <rect x="0" y="7" width="${W}" height="${H}" rx="9" fill="#055560"/>
  <rect x="0" y="0" width="${W}" height="${H}" rx="9" fill="url(#__pcb)"/>
</g>
<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="7" fill="none" stroke="#fff" stroke-opacity=".12"/>
<g filter="url(#__shs)">
  <rect x="-12" y="26" width="64" height="58" rx="3" fill="url(#__metal)" stroke="#8b929c" stroke-width=".8"/>
  <rect x="-7" y="32" width="52" height="46" rx="2" fill="#dfe3e8" stroke="#a9b0ba" stroke-width=".6"/>
  <rect x="-3" y="48" width="40" height="14" rx="1" fill="#2b2e35"/>
  <rect x="-16" y="168" width="68" height="60" rx="5" fill="url(#__black)"/>
  <circle cx="22" cy="198" r="12" fill="#08080a" stroke="#52525a" stroke-width="1"/>
  <circle cx="22" cy="198" r="3.4" fill="#8c8f98"/>
</g>
<g filter="url(#__shs)">
  <rect x="64" y="22" width="28" height="28" rx="3" fill="#d6d9df" stroke="#8d949e" stroke-width=".7"/>
  <circle cx="78" cy="36" r="9" fill="#d03a34"/><circle cx="76" cy="33" r="3.2" fill="#fff" fill-opacity=".5"/>
  <rect x="166" y="122" width="122" height="38" rx="2.5" fill="url(#__black)"/>
  ${Array.from({ length: 14 }, (_, i) => `<rect x="${172 + i * 8.2}" y="117" width="3" height="6" fill="#c8ccd2"/><rect x="${172 + i * 8.2}" y="159" width="3" height="6" fill="#c8ccd2"/>`).join('')}
  <path d="M166 135 a5 5 0 0 1 0 10" fill="#06060a"/>
  <ellipse cx="116" cy="150" rx="16" ry="8" fill="url(#__metal)" stroke="#7d848e" stroke-width=".6"/>
  <circle cx="84" cy="132" r="10" fill="url(#__metal)" stroke="#6f7680" stroke-width=".6"/><circle cx="84" cy="132" r="5.5" fill="#4b4f57"/>
  <circle cx="84" cy="164" r="10" fill="url(#__metal)" stroke="#6f7680" stroke-width=".6"/><circle cx="84" cy="164" r="5.5" fill="#4b4f57"/>
  <rect x="306" y="124" width="22" height="34" rx="1.5" fill="url(#__black)"/>
  ${Array.from({ length: 6 }, (_, i) => `<rect x="${309 + (i % 2) * 8}" y="${128 + Math.floor(i / 2) * 10}" width="5" height="5" rx=".8" fill="#050506" stroke="#55555e" stroke-width=".4"/>`).join('')}
  <rect x="236" y="78" width="30" height="12" rx="1.5" fill="url(#__black)"/>
</g>
<rect x="296" y="96" width="9" height="5" rx="1" fill="#f3d36b"/><rect x="296" y="105" width="9" height="5" rx="1" fill="#f3d36b"/><rect x="310" y="96" width="9" height="5" rx="1" fill="#8fe39a"/><rect x="310" y="105" width="9" height="5" rx="1" fill="#f3d36b"/>
${[[64, 66], [290, 56], [70, 236], [318, 236]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#06505a" stroke="#d9c27a" stroke-width="2"/>`).join('')}
${header(xsOf(isD1, 'top'), 16)}${header(xsOf(isD2, 'top'), 16)}${header(xsOf(isPow, 'bottom'), H - 16)}${header(xsOf((n) => /^A\d$/.test(n), 'bottom'), H - 16)}`)

  // Upright silkscreen: positions are mapped through the 180° turn, text stays readable.
  const m = (x: number, y: number): Pt => [n2(W - x), n2(H - y)]
  const txt = (x: number, y: number, s: string, size: number, extra = '') => {
    const [tx, ty] = m(x, y)
    return `<text x="${tx}" y="${ty}" font-size="${size}" text-anchor="middle" ${extra}>${s}</text>`
  }
  const labels = pins.map(([name, p]) => {
    const [px, py] = m(p.x, p.y)
    const color = used[name]
    const down = p.edge === 'top' // after the turn the top header sits at the bottom: labels go up
    const ly = down ? py - 12 : py + 12
    const rot = down ? -90 : 90
    const ring = color ? `<circle cx="${px}" cy="${py}" r="7.4" fill="${color}" fill-opacity=".28" stroke="${color}" stroke-width="1.6"/>` : ''
    return `${ring}<text transform="translate(${px} ${ly}) rotate(${rot})" font-size="${color ? 7.6 : 6.6}" font-weight="${color ? 800 : 600}" fill="${color ? '#fff4c2' : '#e8fbfc'}" fill-opacity="${color ? 1 : 0.88}">${p.label}</text>`
  }).join('')
  const silk = `<g font-family="ui-sans-serif,system-ui,-apple-system,sans-serif" fill="#fff" fill-opacity=".9">
${txt(210, 78, 'ARDUINO', 17, 'font-weight="800" letter-spacing="1.5"')}${txt(210, 56, 'UNO', 11, 'font-weight="700" fill-opacity=".8"')}
${txt(227, 142, 'ATMEGA328P', 7, 'fill="#aeb4be" font-weight="600"')}
${txt(110, 122, '16.000', 5.5, 'fill-opacity=".7"')}
${txt(260, H - 36, 'POWER', 6, 'fill-opacity=".6" font-weight="700"')}${txt(236, 36, 'ANALOG IN', 6, 'fill-opacity=".6" font-weight="700"')}
${txt(272, 36, 'DIGITAL (PWM~)', 6.4, 'fill-opacity=".6" font-weight="700"')}
${labels}
</g>`
  return `<g transform="translate(${ox} ${oy})"><g transform="rotate(180 ${cx} ${cy})">${art}</g>${silk}</g>`
}

/* ------------------------------------------------------------------ breadboard */

const ROW_Y: Record<string, number> = {}
;(() => {
  const yA = 50
  const yF = yA + 4 * P + 2.5 * P
  'abcde'.split('').forEach((r, i) => { ROW_Y[r] = yA + i * P })
  'fghij'.split('').forEach((r, i) => { ROW_Y[r] = yF + i * P })
})()
export const BB_RAIL_Y: Record<string, number> = { 'T-': 14, 'T+': 14 + P, 'B+': ROW_Y.j + 22, 'B-': ROW_Y.j + 22 + P }

/** hole centre of column 1..30, row a..j (relative to the breadboard origin) */
export function bbHole(col: number, row: string): Pt {
  return [n2(22 + (col - 1) * P), n2(ROW_Y[row])]
}
/** rail hole 1..25 of a rail ('T-', 'T+', 'B+', 'B-') */
export function bbRail(rail: string, i: number): Pt {
  const slot = Math.floor((i - 1) / 5) * 6 + ((i - 1) % 5)
  return [n2(22 + 6.35 + slot * P), n2(BB_RAIL_Y[rail])]
}

export function breadboard(k: K, ox: number, oy: number, hiCols: number[] = []): string {
  const g = (s: string) => s.replace(/__(\w+)/g, (_m, id) => k(id))
  const holes: string[] = []
  const hole = (x: number, y: number) => holes.push(`M${n2(x - 2.9)} ${n2(y - 2.9)}h5.8v5.8h-5.8z`)
  for (let c = 1; c <= 30; c++) for (const r of 'abcdefghij') { const [x, y] = bbHole(c, r); hole(x, y) }
  for (const rail of Object.keys(BB_RAIL_Y)) for (let i = 1; i <= 25; i++) { const [x, y] = bbRail(rail, i); hole(x, y) }
  const nums = Array.from({ length: 30 }, (_, i) => {
    const c = i + 1
    const [x] = bbHole(c, 'a')
    const hi = hiCols.includes(c)
    return `<text x="${x}" y="${ROW_Y.a - 10}" text-anchor="middle" font-size="${hi ? 7.4 : 5.8}" font-weight="${hi ? 800 : 500}" fill="${hi ? '#b3261e' : '#8b887c'}">${c}</text>`
  }).join('')
  const rows = 'abcdefghij'.split('').map((r) => `<text x="9" y="${ROW_Y[r] + 2.4}" text-anchor="middle" font-size="6.6" font-weight="600" fill="#8b887c">${r}</text>`).join('')
  const railLine = (rail: string, color: string, sign: string) => {
    const y = BB_RAIL_Y[rail]
    const off = rail[0] === 'T' ? (rail[1] === '-' ? -8.5 : 8.5) : (rail[1] === '+' ? -8.5 : 8.5)
    return `<line x1="${bbRail(rail, 1)[0] - 6}" x2="${bbRail(rail, 25)[0] + 6}" y1="${y + off}" y2="${y + off}" stroke="${color}" stroke-width="1.4"/>
<text x="9" y="${y + 3}" text-anchor="middle" font-size="9" font-weight="800" fill="${color}">${sign}</text>`
  }
  return g(`<g transform="translate(${ox} ${oy})" font-family="ui-sans-serif,system-ui,sans-serif">
<g filter="url(#__sh)">
  <rect x="0" y="6" width="${BB_W}" height="${BB_H}" rx="6" fill="#b9b5a6"/>
  <rect x="0" y="0" width="${BB_W}" height="${BB_H}" rx="6" fill="url(#__bb)" stroke="#fff" stroke-opacity=".6"/>
</g>
<rect x="8" y="${ROW_Y.e + 8}" width="${BB_W - 16}" height="${ROW_Y.f - ROW_Y.e - 16}" rx="2" fill="url(#__chan)"/>
${hiCols.map((c) => `<rect x="${bbHole(c, 'a')[0] - 7}" y="${ROW_Y.a - 7}" width="14" height="${ROW_Y.e - ROW_Y.a + 14}" rx="3" fill="#f2c94c" fill-opacity=".16"/><rect x="${bbHole(c, 'f')[0] - 7}" y="${ROW_Y.f - 7}" width="14" height="${ROW_Y.j - ROW_Y.f + 14}" rx="3" fill="#f2c94c" fill-opacity=".16"/>`).join('')}
<path d="${holes.join('')}" fill="#34343a"/>
<path d="${holes.join('')}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".6" transform="translate(0 .7)"/>
${railLine('T-', '#2f6fd6', '−')}${railLine('T+', '#d9342b', '+')}${railLine('B+', '#d9342b', '+')}${railLine('B-', '#2f6fd6', '−')}
${nums}${rows}
</g>`)
}

/* ------------------------------------------------------------------ wires */

function roundedPath(pts: Pt[], r = 13): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]
    const [cx, cy] = pts[i]
    const [nx, ny] = pts[i + 1]
    const l1 = Math.hypot(cx - px, cy - py) || 1
    const l2 = Math.hypot(nx - cx, ny - cy) || 1
    const a = Math.min(r, l1 / 2)
    const b = Math.min(r, l2 / 2)
    d += `L${n2(cx - ((cx - px) / l1) * a)} ${n2(cy - ((cy - py) / l1) * a)}Q${cx} ${cy} ${n2(cx + ((nx - cx) / l2) * b)} ${n2(cy + ((ny - cy) / l2) * b)}`
  }
  const last = pts[pts.length - 1]
  return `${d}L${last[0]} ${last[1]}`
}

export function wirePath(a: Pt, b: Pt, via?: Pt[]): string {
  if (via && via.length) return roundedPath([a, ...via, b])
  const dy = b[1] - a[1]
  const s = dy >= 0 ? 1 : -1
  const d = Math.min(90, Math.max(20, Math.abs(dy) * 0.45))
  return `M${a[0]} ${a[1]}C${a[0]} ${n2(a[1] + s * d)} ${b[0]} ${n2(b[1] - s * d)} ${b[0]} ${b[1]}`
}

export function wire(a: Pt, b: Pt, color: string, via?: Pt[], title = ''): string {
  const [fill, edge] = WIRE_COLORS[color] ?? WIRE_COLORS.black
  const d = wirePath(a, b, via)
  const cap = (p: Pt) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.6" fill="${edge}"/><circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${fill}"/><circle cx="${p[0] - 0.8}" cy="${p[1] - 1}" r="1.1" fill="#fff" fill-opacity=".55"/>`
  return `<g class="wire" stroke-linecap="round" stroke-linejoin="round" fill="none">${title ? `<title>${title}</title>` : ''}
<path d="${d}" stroke="transparent" stroke-width="16" pointer-events="stroke"/>
<path d="${d}" stroke="#000" stroke-opacity=".28" stroke-width="6" transform="translate(1.5 5)"/>
<path d="${d}" stroke="${edge}" stroke-width="6.4"/>
<path d="${d}" stroke="${fill}" stroke-width="4.2"/>
<path d="${d}" stroke="#fff" stroke-opacity=".38" stroke-width="1.1" transform="translate(-.9 -.9)"/>
${cap(a)}${cap(b)}</g>`
}

/* ------------------------------------------------------------------ components */

const legPath = (pts: Pt[]) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#6b717b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#dfe3e8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`

/** 220 Ω carbon-film resistor lying between two holes: red-red-brown-gold. */
export function resistor(a: Pt, b: Pt): string {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  const bands: Array<[number, string]> = [[-11, '#c4271c'], [-5, '#c4271c'], [1, '#6b3a1a'], [11, '#d6a92e']]
  return `<g filter="url(#__shs)">
${legPath([a, [mx, my]])}${legPath([b, [mx, my]])}
<g transform="translate(${n2(mx)} ${n2(my)}) rotate(${n2(ang)})">
  <path d="M-19 -3.6 Q-19 -6 -15.5 -6.2 L-11 -4.2 H11 L15.5 -6.2 Q19 -6 19 -3.6 V3.6 Q19 6 15.5 6.2 L11 4.2 H-11 L-15.5 6.2 Q-19 6 -19 3.6Z" fill="#e8d3a2" stroke="#a88f55" stroke-width=".7"/>
  ${bands.map(([x, c]) => `<rect x="${x - 1.7}" y="-5.2" width="3.4" height="10.4" fill="${c}"/>`).join('')}
  <path d="M-17 -3.2 H17" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/>
</g></g>`
}

/** Red 5 mm LED: long (+) anode leg with a kink, short (−) cathode leg. `lean` is the direction the dome sits relative to the legs. */
export function led(id: string, an: Pt, ca: Pt, lean: Pt = [0, 1]) {
  const mx = (an[0] + ca[0]) / 2 + lean[0] * 17
  const my = (an[1] + ca[1]) / 2 + lean[1] * 17
  const anKink: Pt = [an[0] + (mx - an[0]) * 0.25 - lean[1] * 3, an[1] + (my - an[1]) * 0.25 + lean[0] * 3]
  return {
    parts: `<g filter="url(#__shs)">
${legPath([ca, [mx, my]])}${legPath([an, anKink, [mx, my]])}
<circle cx="${n2(mx)}" cy="${n2(my)}" r="15.2" fill="#a51a20"/>
<circle cx="${n2(mx)}" cy="${n2(my)}" r="13.2" fill="url(#__dome)" stroke="#6e0d12" stroke-width=".8"/>
<circle data-role="led-lit-${id}" cx="${n2(mx)}" cy="${n2(my)}" r="13.2" fill="url(#__domeOn)" opacity="0"/>
<ellipse cx="${n2(mx - 4.4)}" cy="${n2(my - 5)}" rx="4.8" ry="3" fill="#fff" fill-opacity=".62" transform="rotate(-28 ${n2(mx - 4.4)} ${n2(my - 5)})"/>
</g>
<g font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800" font-size="8" fill="#6b6a60"><text x="${an[0] - lean[0] * 9}" y="${an[1] - lean[1] * 9 + 3}" text-anchor="middle">+</text><text x="${ca[0] - lean[0] * 9}" y="${ca[1] - lean[1] * 9 + 3}" text-anchor="middle">−</text></g>`,
    glow: `<circle data-role="led-glow-${id}" cx="${n2(mx)}" cy="${n2(my)}" r="46" fill="url(#__halo)" opacity="0" pointer-events="none"/>`,
    center: [mx, my] as Pt,
  }
}

/** 4-leg tact switch straddling the channel; tl/tr are the upper pair, bl/br the lower pair. */
export function tact(id: string, tl: Pt, br: Pt) {
  const cx = (tl[0] + br[0]) / 2
  const cy = (tl[1] + br[1]) / 2
  const w = br[0] - tl[0]
  const h = br[1] - tl[1]
  return {
    parts: `<g filter="url(#__shs)" transform="translate(${n2(cx)} ${n2(cy)})">
  ${[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => `<rect x="${sx * (w / 2) - 3}" y="${sy * (h / 2) - 3}" width="6" height="6" rx="1" fill="url(#__metal)"/>`).join('')}
  <rect x="-19" y="-19" width="38" height="38" rx="5" fill="url(#__black)" stroke="#0b0b0e" stroke-width=".7"/>
  <circle cx="0" cy="0" r="14.5" fill="#1b1b1f"/>
  <g data-role="btn-cap-${id}"><circle cx="0" cy="1.6" r="12" fill="#1a2d57"/><circle cx="0" cy="0" r="12" fill="url(#__cap)" stroke="#223f7c" stroke-width=".7"/><ellipse cx="-3.4" cy="-4.4" rx="4.4" ry="2.6" fill="#fff" fill-opacity=".45"/></g>
</g>`,
    hit: `<circle data-role="btn-hit-${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="22" fill="transparent" tabindex="0" role="button" aria-label="택트 스위치 (누르고 있으면 D2가 LOW)" aria-pressed="false" style="cursor:pointer" class="hit"/>`,
    center: [cx, cy] as Pt,
  }
}

/** 10 kΩ rotary potentiometer. Pins left/mid/right sit on the bottom edge; the knob turns 270°. */
export function pot(id: string, l: Pt, m: Pt, r: Pt) {
  const cx = m[0]
  const cy = m[1] - 36
  const ticks = [0, 1].map((e) => {
    const a = ((-225 + e * 270) * Math.PI) / 180
    return `<line x1="${n2(cx + Math.cos(a) * 31)}" y1="${n2(cy + Math.sin(a) * 31)}" x2="${n2(cx + Math.cos(a) * 36)}" y2="${n2(cy + Math.sin(a) * 36)}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`
  }).join('')
  return {
    parts: `<g filter="url(#__shs)">
  ${[l, m, r].map((p) => `<rect x="${p[0] - 1.8}" y="${cy + 20}" width="3.6" height="${p[1] - cy - 20}" fill="url(#__metal)"/>`).join('')}
  <rect x="${cx - 40}" y="${cy - 40}" width="80" height="62" rx="7" fill="#1456a6"/>
  <rect x="${cx - 40}" y="${cy - 40}" width="80" height="58" rx="7" fill="url(#__blue)" stroke="#0e3f7e" stroke-width=".8"/>
  <g font-family="ui-sans-serif,system-ui,sans-serif" font-size="7.5" font-weight="700" fill="#fff" fill-opacity=".85" text-anchor="middle"><text x="${cx - 30}" y="${cy + 14}">5V</text><text x="${cx}" y="${cy + 14}" font-size="6.5">A0</text><text x="${cx + 30}" y="${cy + 14}">GND</text><text x="${cx}" y="${cy - 29}" font-size="7">10kΩ</text></g>
  ${ticks}
  <circle cx="${cx}" cy="${cy}" r="24" fill="#0b2f63" fill-opacity=".55"/>
  <g data-role="knob-${id}" transform="rotate(0 ${cx} ${cy})">
    <circle cx="${cx}" cy="${cy}" r="21" fill="url(#__knob)" stroke="#767e8a" stroke-width=".9"/>
    <circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#9aa1ac" stroke-width=".8"/>
    <rect x="${cx - 2.2}" y="${cy - 19}" width="4.4" height="13" rx="2" fill="#d33a2f"/>
  </g>
</g>`,
    hit: `<circle data-role="knob-hit-${id}" cx="${cx}" cy="${cy}" r="26" fill="transparent" class="hit" style="cursor:grab"/>`,
    center: [cx, cy] as Pt,
  }
}

/** Passive piezo buzzer; pins `plus`/`minus` are the leg tips. */
export function buzzer(id: string, plus: Pt, minus: Pt) {
  const cx = (plus[0] + minus[0]) / 2
  const cy = plus[1] + 46
  return {
    parts: `<g filter="url(#__shs)">
  ${legPath([plus, [plus[0], cy - 20]])}${legPath([minus, [minus[0], cy - 20]])}
  <circle cx="${cx}" cy="${cy + 3}" r="31" fill="#08080a"/>
  <circle cx="${cx}" cy="${cy}" r="31" fill="url(#__buz)" stroke="#000" stroke-width=".8"/>
  <circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="#fff" stroke-opacity=".12"/>
  <circle cx="${cx}" cy="${cy}" r="4.2" fill="#000" stroke="#555" stroke-width=".8"/>
  <text x="${cx - 18}" y="${cy - 14}" font-size="11" font-weight="800" fill="#e8e8ee" font-family="ui-sans-serif,system-ui,sans-serif">+</text>
  <ellipse cx="${cx - 11}" cy="${cy - 16}" rx="12" ry="5" fill="#fff" fill-opacity=".14" transform="rotate(-30 ${cx - 11} ${cy - 16})"/>
</g>`,
    waves: `<g data-role="waves-${id}" class="waves" pointer-events="none" fill="none" stroke="#2f8de0" stroke-width="2.4">${[0, 1, 2].map((i) => `<circle cx="${cx}" cy="${cy}" r="34" style="animation-delay:${i * 0.45}s"/>`).join('')}</g>`,
    center: [cx, cy] as Pt,
  }
}

/** HC-SR04 laid out with pins on the bottom edge (local), then turned by `rot` (0/90/180/270, clockwise) around its top-left corner at (ox, oy). */
export function hcsr04(id: string, ox: number, oy: number, rot: 0 | 90 | 180 | 270) {
  const w = 225
  const h = 100
  const map = ([x, y]: Pt): Pt => {
    const [rx, ry] = rot === 0 ? [x, y] : rot === 90 ? [h - y, x] : rot === 180 ? [w - x, h - y] : [y, w - x]
    return [n2(ox + rx), n2(oy + ry)]
  }
  const names = ['VCC', 'Trig', 'Echo', 'GND']
  const pinsLocal = names.map((n, i) => [n, [w / 2 + (i - 1.5) * P, h - 9] as Pt] as const)
  const pins: Record<string, Pt> = {}
  pinsLocal.forEach(([n, p]) => { pins[n] = map(p) })
  const tr = (cx: number) => `<circle cx="${cx}" cy="46" r="40" fill="#0c0d10" opacity=".35" transform="translate(0 4)"/><circle cx="${cx}" cy="46" r="40" fill="url(#__ring)" stroke="#6e7580" stroke-width=".8"/><circle cx="${cx}" cy="46" r="31" fill="url(#__mesh)"/><circle cx="${cx}" cy="46" r="31" fill="none" stroke="#9aa1ac" stroke-width="1"/><circle cx="${cx}" cy="46" r="17" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1.5"/><ellipse cx="${cx - 10}" cy="30" rx="12" ry="6" fill="#fff" fill-opacity=".14" transform="rotate(-30 ${cx - 10} 30)"/>`
  const ang = rot
  const [rotx, roty] = [ox, oy]
  const origin = rot === 0 ? [0, 0] : rot === 90 ? [h, 0] : rot === 180 ? [w, h] : [0, w]
  const transform = `translate(${n2(rotx + origin[0])} ${n2(roty + origin[1])}) rotate(${ang})`
  // body: rotated with the whole sensor so labels turn too; pin-name labels are drawn upright separately
  const body = `<g filter="url(#__sh)"><g transform="${transform}">
  <rect x="0" y="5" width="${w}" height="${h}" rx="5" fill="#0f3f78"/>
  <rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="url(#__hcb)" stroke="#0d3566" stroke-width=".8"/>
  ${tr(52)}${tr(w - 52)}
  <rect x="${w / 2 - 12}" y="26" width="24" height="12" rx="2" fill="url(#__metal)" stroke="#7d848e" stroke-width=".5"/>
  <rect x="${w / 2 - 10}" y="46" width="20" height="12" rx="1.5" fill="#101114"/>
  <rect x="${w / 2 - 30}" y="${h - 17}" width="60" height="16" rx="1.5" fill="url(#__black)"/>
  ${pinsLocal.map(([, p]) => `<rect x="${p[0] - 3.4}" y="${p[1] - 3.4}" width="6.8" height="6.8" fill="#d9bd5a" stroke="#8a7424" stroke-width=".5"/>`).join('')}
  <path d="M${w / 2 - 36} 36 H${w / 2 + 36}" stroke="#fff" stroke-opacity=".0"/>
</g></g>`
  const labelSide = rot === 0 ? [0, -11] : rot === 90 ? [11, 0] : rot === 180 ? [0, 11] : [-11, 0]
  const labels = `<g font-family="ui-sans-serif,system-ui,sans-serif" font-size="5" font-weight="800" fill="#fff" fill-opacity=".92" text-anchor="middle">
${names.map((n) => { const p = pins[n]; return `<text x="${n2(p[0] + labelSide[0] * 1.4)}" y="${n2(p[1] + labelSide[1] * 1.4 + 2.4)}" ${rot === 90 || rot === 270 ? `text-anchor="${rot === 90 ? 'start' : 'end'}"` : ''}>${n}</text>` }).join('')}
<text x="${map([w / 2, 92])[0]}" y="${map([w / 2, 92])[1]}" font-size="0"></text></g>`
  const frontCenter = map([w / 2, 0])
  const front: Pt = rot === 0 ? [0, -1] : rot === 90 ? [1, 0] : rot === 180 ? [0, 1] : [-1, 0]
  return { pins, parts: body + labels, frontCenter, front, size: [w, h] as Pt }
}

/** SG90 micro servo laid out with the cable on the left (local), turned `rot` clockwise around (ox, oy). */
export function servo(id: string, ox: number, oy: number, rot: 0 | 90 | 180 | 270) {
  const w = 160
  const h = 56
  const map = ([x, y]: Pt): Pt => {
    const [rx, ry] = rot === 0 ? [x, y] : rot === 90 ? [h - y, x] : rot === 180 ? [w - x, h - y] : [y, w - x]
    return [n2(ox + rx), n2(oy + ry)]
  }
  const origin = rot === 0 ? [0, 0] : rot === 90 ? [h, 0] : rot === 180 ? [w, h] : [0, w]
  const pins: Record<string, Pt> = { GND: map([20, 21]), '5V': map([20, 28]), SIG: map([20, 35]) }
  const pivot = map([122, 28])
  const body = `<g filter="url(#__sh)"><g transform="translate(${n2(ox + origin[0])} ${n2(oy + origin[1])}) rotate(${rot})">
  <rect x="0" y="16" width="${w}" height="24" rx="3" fill="#1a1c20"/>
  <rect x="0" y="14" width="${w}" height="24" rx="3" fill="#2f3138"/>
  <circle cx="9" cy="26" r="3.4" fill="#0b0b0d"/><circle cx="${w - 9}" cy="26" r="3.4" fill="#0b0b0d"/>
  <rect x="24" y="2" width="112" height="${h - 4}" rx="4" fill="#0d3d78"/>
  <rect x="24" y="0" width="112" height="${h - 4}" rx="4" fill="url(#__blue)" stroke="#0a3566" stroke-width=".8"/>
  <rect x="34" y="18" width="52" height="16" rx="2" fill="#eaf1fb" fill-opacity=".9"/>
  <text x="60" y="30" font-size="9" font-weight="800" text-anchor="middle" fill="#0d3d78" font-family="ui-sans-serif,system-ui,sans-serif">SG90</text>
  <circle cx="122" cy="26" r="11" fill="#1a1c20"/><circle cx="122" cy="26" r="7" fill="url(#__metal)"/>
  <rect x="14" y="21" width="12" height="14" rx="2" fill="#17181c"/>
</g></g>`
  const horn = `<g data-role="horn-${id}" transform="rotate(0 ${pivot[0]} ${pivot[1]})" filter="url(#__shs)">
  <path d="M${pivot[0] - 52} ${pivot[1] - 5.5} Q${pivot[0] - 56} ${pivot[1]} ${pivot[0] - 52} ${pivot[1] + 5.5} L${pivot[0]} ${pivot[1] + 9} V${pivot[1] - 9}Z" fill="url(#__horn)" stroke="#aeb4bd" stroke-width=".8"/>
  <circle cx="${pivot[0] - 44}" cy="${pivot[1]}" r="1.8" fill="#9aa1ac"/><circle cx="${pivot[0] - 32}" cy="${pivot[1]}" r="1.8" fill="#9aa1ac"/><circle cx="${pivot[0] - 20}" cy="${pivot[1]}" r="1.8" fill="#9aa1ac"/>
  <circle cx="${pivot[0]}" cy="${pivot[1]}" r="10" fill="url(#__horn)" stroke="#aeb4bd" stroke-width=".8"/><circle cx="${pivot[0]}" cy="${pivot[1]}" r="3.2" fill="#6f7680"/>
</g>`
  const arcPt = (deg: number, r: number) => [n2(pivot[0] - Math.cos((deg * Math.PI) / 180) * r), n2(pivot[1] + Math.sin((deg * Math.PI) / 180) * r)]
  const a0 = arcPt(0, 62)
  const a1 = arcPt(180, 62)
  const scale = `<g font-family="ui-sans-serif,system-ui,sans-serif" font-size="8" font-weight="700" fill="#8a929d" text-anchor="middle" pointer-events="none">
  <path d="M${a0[0]} ${a0[1]} A62 62 0 0 0 ${a1[0]} ${a1[1]}" fill="none" stroke="#8a929d" stroke-width="1.2" stroke-dasharray="2 3"/>
  ${[0, 90, 180].map((d) => { const p = arcPt(d, 74); return `<text x="${p[0]}" y="${p[1] + 3}">${d}°</text>` }).join('')}
</g>`
  return { pins, parts: body, horn, scale, pivot }
}

/** Cardboard box in front of the HC-SR04. `data-role="obj-<id>"` is translated along the sensor axis. */
export function obstacle(id: string, cx: number, cy: number, rot: number) {
  return `<g data-role="obj-${id}" transform="translate(0 0)" filter="url(#__shs)"><g transform="translate(${cx} ${cy}) rotate(${rot})">
  <rect x="-46" y="-8" width="92" height="16" rx="3" fill="#c79a5b" stroke="#8d6730" stroke-width=".8"/>
  <rect x="-46" y="-8" width="92" height="5" rx="3" fill="#e2bd83"/>
  <rect x="-9" y="-8" width="18" height="16" fill="#e9d6ad" fill-opacity=".7"/>
</g></g>`
}
