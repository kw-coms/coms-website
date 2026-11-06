// Turns a circuit definition into geometry (where is this terminal?) and connectivity (which terminals
// are electrically the same node?). The drawing uses pointOf; tests/circuits.test.mjs uses nets to prove
// every drawing matches its wiring table.
import { bbHole, bbRail, hcsr04, servo, unoPin, type Pt } from './parts'
import type { CircuitDef, PartDef, Ref } from './definitions'

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]

/** Free-standing parts (sensor, servo) report their own pin positions. */
export function freePins(def: CircuitDef, part: PartDef): Record<string, Pt> | null {
  if (part.kind === 'hcsr04') return hcsr04(part.id, part.at[0], part.at[1], part.rot).pins
  if (part.kind === 'servo') return servo(part.id, part.at[0], part.at[1], part.rot).pins
  return null
}

function partPin(part: PartDef, pin: string): Ref | Pt | null {
  switch (part.kind) {
    case 'resistor': return pin === 'a' ? part.a : pin === 'b' ? part.b : null
    case 'led': return pin === 'an' ? part.an : pin === 'ca' ? part.ca : null
    case 'tact': {
      const m = /^bb:(\d+)([a-j])$/.exec(part.tl)
      const n = /^bb:(\d+)([a-j])$/.exec(part.br)
      if (!m || !n) return null
      if (pin === 'tl') return part.tl
      if (pin === 'br') return part.br
      if (pin === 'tr') return `bb:${n[1]}${m[2]}`
      if (pin === 'bl') return `bb:${m[1]}${n[2]}`
      return null
    }
    case 'pot': return pin === 'l' ? part.l : pin === 'm' ? part.m : pin === 'r' ? part.r : null
    case 'buzzer': return pin === 'plus' ? part.plus : pin === 'minus' ? part.minus : null
    default: return null
  }
}

export function pointOf(def: CircuitDef, ref: Ref | Pt): Pt {
  if (typeof ref !== 'string') return ref
  const [kind, ...rest] = ref.split(':')
  if (kind === 'uno') return unoPin(def.uno[0], def.uno[1], rest[0])
  if (kind === 'bb') {
    const m = /^(\d+)([a-j])$/.exec(rest[0])
    if (!m || !def.bb) throw new Error(`bad breadboard hole ${ref}`)
    return add(def.bb.at, bbHole(Number(m[1]), m[2]))
  }
  if (kind === 'bbr') {
    if (!def.bb) throw new Error(`no breadboard for ${ref}`)
    return add(def.bb.at, bbRail(rest[0], Number(rest[1])))
  }
  const dot = ref.indexOf('.')
  if (dot > 0) {
    const part = def.parts.find((p) => p.id === ref.slice(0, dot))
    const pin = ref.slice(dot + 1)
    if (!part) throw new Error(`unknown part in ${ref}`)
    const free = freePins(def, part)
    if (free) {
      if (!free[pin]) throw new Error(`unknown pin ${ref}`)
      return free[pin]
    }
    const target = partPin(part, pin)
    if (target == null) throw new Error(`unknown pin ${ref}`)
    return pointOf(def, target)
  }
  throw new Error(`bad terminal ${ref}`)
}

/** Canonical node name: everything that is wired together by the board itself shares a name. */
export function nodeOf(def: CircuitDef, ref: Ref | Pt): string {
  if (typeof ref !== 'string') return `pt:${ref[0]},${ref[1]}`
  const [kind, ...rest] = ref.split(':')
  if (kind === 'uno') return /^GND/.test(rest[0]) ? 'uno:GND' : ref
  if (kind === 'bb') {
    const m = /^(\d+)([a-j])$/.exec(rest[0])!
    return `bb:${m[1]}${m[2] <= 'e' ? 'top' : 'bottom'}`
  }
  if (kind === 'bbr') return `bbr:${rest[0]}`
  const dot = ref.indexOf('.')
  const part = def.parts.find((p) => p.id === ref.slice(0, dot))!
  if (freePins(def, part)) return ref
  const target = partPin(part, ref.slice(dot + 1))
  return target == null ? ref : typeof target === 'string' ? nodeOf(def, target) : ref
}

/** Union-find over the wires. `pressed` closes the push button (tl/tr side joined to bl/br side). */
export function nets(def: CircuitDef, pressed = false) {
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    if (!parent.has(a)) parent.set(a, a)
    let r = a
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(a, r)
    return r
  }
  const union = (a: string, b: string) => { parent.set(find(a), find(b)) }
  def.wires.forEach((w) => union(nodeOf(def, w.from), nodeOf(def, w.to)))
  def.parts.forEach((p) => {
    if (p.kind !== 'tact') return
    union(nodeOf(def, `${p.id}.tl`), nodeOf(def, `${p.id}.tr`)) // same side of a tact switch is always joined
    union(nodeOf(def, `${p.id}.bl`), nodeOf(def, `${p.id}.br`))
    if (pressed) union(nodeOf(def, `${p.id}.tl`), nodeOf(def, `${p.id}.br`))
  })
  return (a: Ref, b: Ref) => find(nodeOf(def, a)) === find(nodeOf(def, b))
}
