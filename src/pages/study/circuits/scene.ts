// Builds the SVG markup of one circuit from its definition. Pure string work, no DOM.
import { battery, breadboard, buzzer, cds, dcMotor, dht11, hcsr04, joystick, l9110s, lcd, led, obstacle, pot, resistor, rgbLed, servo, sharedDefs, tact, uno, wire, WIRE_COLORS, type Pt } from './parts'
import type { CircuitDef } from './definitions'
import { pointOf } from './netlist'

/** Per-scene id prefix so two circuits on one page never share gradient ids. */
export function buildScene(def: CircuitDef, uid: string, aria: string): string {
  const k = (name: string) => `${uid}-${name}`
  const sub = (s: string) => s.replace(/__(\w+)/g, (_m, id) => k(id))
  // free text (aria label, wire notes) is escaped so a `__word` in it is never taken for a gradient id
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/__/g, '&#95;&#95;')
  const pt = (ref: string | Pt) => pointOf(def, ref)

  // Arduino pins that carry a wire get a coloured ring on the silkscreen.
  const used: Record<string, string> = {}
  def.wires.forEach((w) => [w.from, w.to].forEach((r) => {
    if (r.startsWith('uno:')) used[r.slice(4)] = WIRE_COLORS[w.color][0]
  }))

  const boards = [uno(k, def.uno[0], def.uno[1], used), def.bb ? breadboard(k, def.bb.at[0], def.bb.at[1], def.bb.hiCols) : ''].join('')
  const parts: string[] = []
  const fx: string[] = []
  const hits: string[] = []
  const own = (id: string, svg: string) => `<g class="cpart" data-cpart="${id}">${svg}</g>`
  const ownFx = (id: string, svg: string) => `<g class="cfx" data-cpart="${id}">${svg}</g>`

  def.parts.forEach((p) => {
    switch (p.kind) {
      case 'resistor':
        parts.push(own(p.id, resistor(pt(p.a), pt(p.b), p.tenK)))
        break
      case 'cds': {
        const c = cds(p.id, pt(p.a), pt(p.b))
        parts.push(own(p.id, c.parts))
        fx.push(ownFx(p.id, c.glow))
        break
      }
      case 'rgb': {
        const r = rgbLed(p.id, pt(p.r), pt(p.c), pt(p.g), pt(p.b))
        parts.push(own(p.id, r.parts))
        fx.push(ownFx(p.id, r.glow))
        break
      }
      case 'lcd':
        parts.push(own(p.id, lcd(p.id, p.at[0], p.at[1]).parts))
        break
      case 'dht':
        parts.push(own(p.id, dht11(p.id, p.at[0], p.at[1]).parts))
        break
      case 'joy': {
        const j = joystick(p.id, p.at[0], p.at[1])
        parts.push(own(p.id, j.parts))
        hits.push(ownFx(p.id, j.hit))
        break
      }
      case 'drv':
        parts.push(own(p.id, l9110s(p.id, p.at[0], p.at[1]).parts))
        break
      case 'motor':
        parts.push(own(p.id, dcMotor(p.id, p.at[0], p.at[1]).parts))
        break
      case 'battery':
        parts.push(own(p.id, battery(p.id, p.at[0], p.at[1]).parts))
        break
      case 'led': {
        const l = led(p.id, pt(p.an), pt(p.ca), [0, 1])
        parts.push(own(p.id, l.parts))
        fx.push(ownFx(p.id, l.glow))
        break
      }
      case 'tact': {
        const t = tact(p.id, pt(p.tl), pt(p.br))
        parts.push(own(p.id, t.parts))
        hits.push(ownFx(p.id, t.hit))
        break
      }
      case 'pot': {
        const q = pot(p.id, pt(p.l), pt(p.m), pt(p.r))
        parts.push(own(p.id, q.parts))
        hits.push(ownFx(p.id, q.hit))
        break
      }
      case 'buzzer': {
        const b = buzzer(p.id, pt(p.plus), pt(p.minus))
        parts.push(own(p.id, b.parts))
        fx.push(ownFx(p.id, b.waves))
        break
      }
      case 'hcsr04':
        parts.push(own(p.id, hcsr04(p.id, p.at[0], p.at[1], p.rot).parts))
        break
      case 'servo': {
        const s = servo(p.id, p.at[0], p.at[1], p.rot)
        parts.push(own(p.id, s.parts + s.scale + s.horn))
        break
      }
    }
  })
  if (def.object) parts.push(`<g class="cobj">${obstacle(def.id, def.object.at[0], def.object.at[1], def.object.rot)}</g>`)

  const wires = def.wires.map((w, i) => {
    const a = pt(w.from)
    const b = pt(w.to)
    const ring = (p: Pt) => `<circle class="wend" cx="${p[0]}" cy="${p[1]}" r="9.5" fill="none" stroke-width="2.2"/>`
    return `<g class="cw" data-w="${i}">${wire(a, b, w.color, w.via, esc(w.note))}${ring(a)}${ring(b)}</g>`
  })

  // role=img would make the focusable push button inside the drawing presentational (axe: nested-interactive).
  const [W, H] = def.size
  return sub(`<svg class="circuit-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="${def.parts.some((p) => p.kind === 'tact') ? 'group' : 'img'}" aria-label="${esc(aria)}" font-family="ui-sans-serif,system-ui,-apple-system,'Noto Sans KR',sans-serif">
${sharedDefs((n) => `__${n}`)}
<g class="layer-board">${boards}</g>
<g class="layer-parts">${parts.join('')}</g>
<g class="layer-wires">${wires.join('')}</g>
<g class="layer-fx">${fx.join('')}</g>
<g class="layer-hit">${hits.join('')}</g>
</svg>`)
}
