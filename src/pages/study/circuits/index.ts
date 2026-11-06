// Runtime for the <figure class="circuit" data-circuit="..."> mount points of a study fragment:
// draws the scene, adds the 3D tilt, the simulation, the assembly stepper and the table <-> drawing links.
// Loaded on demand from studyDemos.ts (only when a fragment contains such a figure).
import { DHT_FAIL, DHT_WAIT, IDLE, RANGES, say } from './chrome'
import { circuitById, type CircuitDef } from './definitions'
import { JOY_TRAVEL } from './parts'
import { buildScene } from './scene'
import * as sim from './sim'

let counter = 0
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Low-power mode (set site-wide on machines without graphics acceleration): flat view, no SVG filters, no continuous animation. */
const lite = () => document.documentElement.dataset.perf === 'lite'

const VIEW_RX = 22
const VIEW_RX_RANGE = 24
const VIEW_RY_RANGE = 25

function findRows(fig: HTMLElement): HTMLTableRowElement[] {
  for (let n = fig.previousElementSibling; n; n = n.previousElementSibling) {
    if (n.matches('.table-wrap')) {
      const t = n.querySelector('table.ref')
      if (t) return Array.from(t.querySelectorAll('tr')).filter((tr) => tr.querySelector('td'))
    }
    if (n.matches('h2, h3, figure')) return []
  }
  return []
}

interface Mounted {
  /** builds the SVG scene into its (already sized) box; everything else of the figure is live from the start */
  attach(): void
  /** the box the scene goes into: what the viewport observer watches */
  plane: HTMLElement
  dispose(): void
}

/**
 * Brings the static chrome of one figure to life (bar, stepper, controls, status line, live region and caption hint are
 * already in the page, generated from chrome.ts, so the figure has its final height before this runs). Only the SVG
 * scene is built later, into the stage box whose size the page already fixed from the scene's viewBox.
 * If anything throws, everything done so far is undone and null is returned (the static figure stays as it was).
 */
function mountOne(fig: HTMLElement, def: CircuitDef): Mounted | null {
  const ac = new AbortController()
  const cleanups: Array<() => void> = []
  try {
    return mountChrome(fig, def, ac, cleanups)
  } catch (err) {
    console.error('circuit figure failed to mount', def.id, err)
    ac.abort()
    cleanups.forEach((c) => { try { c() } catch { /* best effort */ } })
    return null
  }
}

function mountChrome(fig: HTMLElement, def: CircuitDef, ac: AbortController, cleanups: Array<() => void>): Mounted {
  const { signal } = ac
  const uid = `cc${++counter}`
  const aria = fig.getAttribute('aria-label') || ''
  const caption = Array.from(fig.children).find((c) => c.tagName === 'FIGCAPTION') ?? null
  let raf = 0

  /* ---------- DOM (the static chrome generated from chrome.ts) ---------- */
  const statics = Array.from(fig.childNodes, (n) => n.cloneNode(true)) // put back as it was on dispose / failure
  cleanups.push(() => { fig.replaceChildren(...statics); fig.classList.remove('is-live'); fig.removeAttribute('data-sim'); ['data-led', 'data-sound'].forEach((a) => fig.removeAttribute(a)) })
  const need = <T extends Element = HTMLElement>(sel: string) => {
    const el = fig.querySelector<T>(sel)
    if (!el) throw new Error(`static chrome is missing ${sel} (regenerate it: scripts/gen-circuit-chrome.mjs)`)
    return el
  }
  const btnPlay = need<HTMLButtonElement>('.circuit-bar .cb-play')
  const btnView = need<HTMLButtonElement>('.circuit-bar .cb-view')
  const btnSteps = need<HTMLButtonElement>('.circuit-bar .cb-steps')
  const stepper = need('.circuit-stepper')
  const btnPrev = need<HTMLButtonElement>('.circuit-stepper .cb-prev')
  const progress = need('.circuit-progress')
  const btnNext = need<HTMLButtonElement>('.circuit-stepper .cb-next')
  const btnAll = need<HTMLButtonElement>('.circuit-stepper .cb-all')
  const stage = need('.circuit-stage')
  const plane = need('.circuit-plane')
  const ctl = need('.circuit-ctl')
  // the visible status line is plain text (it changes every frame while a sim runs); screen readers get a separate, debounced live region
  const status = need('.circuit-status')
  const live = need('.circuit-live')
  const hint = caption?.querySelector('.circuit-hint') ?? null
  const rangeEls = Array.from(ctl.querySelectorAll<HTMLLabelElement>('.circuit-range'))
  const modeEls = Array.from(ctl.querySelectorAll<HTMLButtonElement>('.cb-mode'))
  const specs = RANGES[def.sim] ?? []
  if (rangeEls.length !== specs.length) throw new Error(`static chrome has ${rangeEls.length} sliders, ${def.sim} needs ${specs.length}`)
  ;[btnPlay, btnView, btnSteps, btnPrev, btnNext, btnAll].forEach((b) => { b.disabled = false })
  stage.tabIndex = 0
  stage.setAttribute('role', 'group')
  stage.setAttribute('aria-label', '회로 그림. 드래그하거나 방향키로 각도를 바꾸고, 더블클릭 또는 Home 키로 처음 각도로 돌립니다.')
  // The scene is built later (when the figure nears the viewport); code that needs its elements runs through onScene
  let svg: SVGSVGElement | null = null
  const sceneHooks: Array<() => void> = []
  const onScene = (fn: () => void) => { if (svg) fn(); else sceneHooks.push(fn) }
  fig.classList.add('is-live')
  fig.setAttribute('data-sim', 'off')

  let lastStatus = IDLE[def.sim]
  const setStatus = (s: string) => { if (s !== lastStatus) { lastStatus = s; status.textContent = s } }
  // announce the latest status ~0.5 s after a user action (never from the animation frame loop)
  let announceTimer = 0
  let lastSaid = lastStatus // the idle instruction is already on screen: do not read it out again on the first click
  const announce = () => {
    window.clearTimeout(announceTimer)
    announceTimer = window.setTimeout(() => { if (lastStatus !== lastSaid) { lastSaid = lastStatus; live.textContent = lastStatus } }, 500)
  }
  ;(['input', 'click', 'pointerup'] as const).forEach((ev) => fig.addEventListener(ev, announce, { signal }))
  // keys: only Enter/Space on things that do not turn them into a click themselves (the drawn push button); Tab, Shift and arrows say nothing
  fig.addEventListener('keyup', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !(e.target as Element).closest('button, input, textarea, select, a')) announce()
  }, { signal })
  cleanups.push(() => window.clearTimeout(announceTimer))

  const q = <T extends Element = SVGElement>(sel: string) => svg?.querySelector<T>(sel) ?? null
  const qa = (sel: string) => (svg ? Array.from(svg.querySelectorAll<SVGElement>(sel)) : [])

  /* ---------- 3D tilt ---------- */
  let userFlat: boolean | null = null // an explicit 평면/3D choice wins over the automatic (reduced motion / lite mode) default
  const autoFlat = () => userFlat ?? (reducedMotion() || lite())
  const view = { flat: autoFlat(), rx: VIEW_RX, ry: 0 }
  const willChange = (on: boolean) => { plane.style.willChange = on ? 'transform' : '' } // a compositor layer only while the plane is being turned
  const applyView = () => {
    plane.style.transform = view.flat ? 'none' : `rotateX(${view.rx.toFixed(1)}deg) rotateY(${view.ry.toFixed(1)}deg)`
    btnView.textContent = view.flat ? '3D로 보기' : '평면으로 보기'
    stage.classList.toggle('is-flat', view.flat)
  }
  const resetView = () => { view.rx = VIEW_RX; view.ry = 0; applyView() }
  const clampView = () => {
    view.rx = Math.min(VIEW_RX + VIEW_RX_RANGE, Math.max(VIEW_RX - VIEW_RX_RANGE, view.rx))
    view.ry = Math.min(VIEW_RY_RANGE, Math.max(-VIEW_RY_RANGE, view.ry))
  }
  btnView.addEventListener('click', () => { view.flat = !view.flat; userFlat = view.flat; if (!view.flat) resetView(); else applyView() }, { signal })
  let drag: { x: number; y: number; rx: number; ry: number; id: number } | null = null
  stage.addEventListener('pointerdown', (e) => {
    if (view.flat || (e.target as Element).closest('.hit, button, input')) return
    drag = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry, id: e.pointerId }
    willChange(true)
  }, { signal })
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!stage.hasPointerCapture(e.pointerId) && Math.hypot(dx, dy) > 4) stage.setPointerCapture(e.pointerId)
    view.ry = drag.ry + dx * 0.25
    if (e.pointerType !== 'touch') view.rx = drag.rx - dy * 0.25
    clampView()
    applyView()
  }, { signal })
  const endDrag = () => { drag = null; willChange(false) }
  stage.addEventListener('pointerup', endDrag, { signal })
  stage.addEventListener('pointercancel', endDrag, { signal })
  stage.addEventListener('dblclick', (e) => { if (!(e.target as Element).closest('.hit')) resetView() }, { signal })
  stage.addEventListener('keydown', (e) => {
    if (e.target !== stage || view.flat) return
    const k = e.key
    if (k === 'Home' || k === 'Escape' || k === '0') resetView()
    else if (k === 'ArrowLeft') view.ry -= 4
    else if (k === 'ArrowRight') view.ry += 4
    else if (k === 'ArrowUp') view.rx += 4
    else if (k === 'ArrowDown') view.rx -= 4
    else return
    e.preventDefault()
    willChange(true)
    window.clearTimeout(keyTimer)
    keyTimer = window.setTimeout(() => willChange(false), 400)
    clampView()
    applyView()
  }, { signal })
  let keyTimer = 0
  cleanups.push(() => window.clearTimeout(keyTimer))
  applyView()
  // the site-wide perf switch (<html data-perf>) and the reduced-motion preference can change while the page is open:
  // only react when the effective default really changes, so the user's angle and explicit choice survive
  const refreshAuto = () => {
    const f = autoFlat()
    if (f === view.flat) return
    view.flat = f
    if (!f) resetView(); else applyView()
  }
  const perfWatch = new MutationObserver(refreshAuto)
  perfWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-perf'] })
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', refreshAuto)
  cleanups.push(() => { perfWatch.disconnect(); motionQuery.removeEventListener('change', refreshAuto) })

  /* ---------- table <-> drawing links and the assembly stepper ---------- */
  const rows = findRows(fig)
  const linked = rows.length === def.steps.length
  const stepOfWire = new Map<number, number>()
  const firstStep = new Map<string, number>()
  def.steps.forEach((s, i) => {
    ;(s.wires || []).forEach((w) => { if (!stepOfWire.has(w)) stepOfWire.set(w, i) })
    ;(s.parts || []).forEach((p) => { if (!firstStep.has(p)) firstStep.set(p, i) })
  })
  const stepper$ = { on: false, n: 1 }
  const wireEl = (i: number) => q(`.cw[data-w="${i}"]`)
  const partEls = (id: string) => qa(`[data-cpart="${id}"]`)

  function clearHl() {
    svg?.querySelectorAll('.is-hl').forEach((n) => n.classList.remove('is-hl'))
    rows.forEach((r) => r.classList.remove('circuit-row-on'))
  }
  function hl(i: number | null) {
    clearHl()
    if (i == null || !linked) return
    const s = def.steps[i]
    ;(s.wires || []).forEach((w) => wireEl(w)?.classList.add('is-hl'))
    ;(s.parts || []).forEach((p) => partEls(p).forEach((n) => n.classList.add('is-hl')))
    rows[i].classList.add('circuit-row-on')
  }
  // the row under the pointer or with focus wins over the stepper's current step; re-applied once the scene exists
  let pointed: number | null = null
  const restoreHl = () => hl(pointed ?? (stepper$.on ? stepper$.n - 1 : null))
  const point = (i: number | null) => { pointed = i; restoreHl() }

  if (linked) {
    // one tab stop per table (roving tabindex): arrow keys move between the rows
    if (hint?.id) rows[0]?.closest('table')?.setAttribute('aria-describedby', hint.id) // described once, on the table
    const setRowTab = (i: number) => rows.forEach((r, k) => r.setAttribute('tabindex', k === i ? '0' : '-1'))
    rows.forEach((row, i) => {
      row.setAttribute('tabindex', i === 0 ? '0' : '-1')
      row.classList.add('circuit-row')
      row.addEventListener('pointerenter', () => point(i), { signal })
      row.addEventListener('pointerleave', () => point(null), { signal })
      row.addEventListener('focus', () => { setRowTab(i); point(i) }, { signal })
      row.addEventListener('blur', () => point(null), { signal })
      row.addEventListener('keydown', (e) => {
        const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : -1
        if (to < 0 || to >= rows.length) return
        e.preventDefault()
        rows[to].focus()
      }, { signal })
    })
    onScene(() => def.wires.forEach((_w, wi) => {
      const el = wireEl(wi)
      const si = stepOfWire.get(wi)
      if (!el || si == null) return
      el.addEventListener('pointerenter', () => { clearHl(); el.classList.add('is-hl'); rows[si].classList.add('circuit-row-on') }, { signal })
      el.addEventListener('pointerleave', restoreHl, { signal })
    }))
    cleanups.push(() => rows.forEach((row) => {
      row.removeAttribute('tabindex'); rows[0]?.closest('table')?.removeAttribute('aria-describedby')
      row.classList.remove('circuit-row', 'circuit-row-on', 'circuit-row-current')
    }))
  }
  // the stepper takes the place of its button inside the bar (whose height is fixed), so showing it moves nothing
  function applyStepper() {
    const { on, n } = stepper$
    stepper.hidden = !on
    btnSteps.hidden = on || !linked
    svg?.querySelectorAll('.cstep-off').forEach((x) => x.classList.remove('cstep-off'))
    rows.forEach((r, i) => r.classList.toggle('circuit-row-current', on && i === n - 1))
    if (on) {
      svg?.querySelectorAll<SVGElement>('[data-cpart]').forEach((x) => {
        const f = firstStep.get(x.getAttribute('data-cpart')!)
        if (f != null && f >= n) x.classList.add('cstep-off')
      })
      stepOfWire.forEach((s, wi) => { if (s >= n) wireEl(wi)?.classList.add('cstep-off') })
      progress.textContent = `${n} / ${def.steps.length}`
    }
    btnPrev.disabled = n <= 1
    btnNext.disabled = n >= def.steps.length
    restoreHl()
  }
  btnSteps.addEventListener('click', () => { stepper$.on = true; stepper$.n = 1; applyStepper(); btnNext.focus() }, { signal })
  btnAll.addEventListener('click', () => { stepper$.on = false; applyStepper(); btnSteps.focus() }, { signal })
  btnPrev.addEventListener('click', () => { stepper$.n = Math.max(1, stepper$.n - 1); applyStepper() }, { signal })
  btnNext.addEventListener('click', () => { stepper$.n = Math.min(def.steps.length, stepper$.n + 1); applyStepper() }, { signal })
  cleanups.push(() => rows.forEach((r) => r.classList.remove('circuit-row-current')))
  applyStepper()

  /* ---------- simulation ---------- */
  let running = false
  /** the i-th slider of the static chrome (label, limits and start value come from chrome.ts RANGES) */
  const range = (i: number, onInput: (v: number) => void) => {
    const input = rangeEls[i].querySelector('input')!
    const out = rangeEls[i].querySelector('output')!
    const { unit } = specs[i]
    input.addEventListener('input', () => { const v = Number(input.value); out.textContent = `${v}${unit}`; onInput(v) }, { signal })
    return { input, out, set(v: number) { input.value = String(v); out.textContent = `${v}${unit}` } }
  }
  const start = (i: number) => specs[i].value
  /** the i-th toggle button after the sliders (chrome.ts MODES) */
  const mode = (i: number) => modeEls[i]
  const setLed = (id: string, level: number) => {
    const lit = q(`[data-role="led-lit-${id}"]`)
    const glow = q(`[data-role="led-glow-${id}"]`)
    if (lit) lit.setAttribute('opacity', String(level))
    if (glow) glow.setAttribute('opacity', String(Math.min(1, level * 0.95)))
    fig.setAttribute('data-led', level > 0.02 ? 'on' : 'off')
  }
  const setWaves = (id: string, on: boolean) => {
    q(`[data-role="waves-${id}"]`)?.classList.toggle('on', on)
    fig.setAttribute('data-sound', on ? 'on' : 'off')
  }
  const moveObject = (cm: number) => {
    if (!def.object) return
    const o = def.object
    const d = o.px0 + o.pxPerCm * cm
    q(`[data-role="obj-${def.id}"]`)?.setAttribute('transform', `translate(${(o.dir[0] * d).toFixed(1)} ${(o.dir[1] * d).toFixed(1)})`)
  }
  const lock = (disabled: boolean) => ctl.querySelectorAll('input, button').forEach((i) => { (i as HTMLInputElement | HTMLButtonElement).disabled = disabled })

  /** Drag-to-turn handling of the potentiometer knob drawn in the scene (shared by 4-4 and 6-4); returns the function that rotates the knob. */
  const bindKnob = (id: string, getRaw: () => number, setRaw: (v: number) => void) => {
    let pivot: [number, number] = [0, 0]
    const turn = (v: number) => q(`[data-role="knob-${id}"]`)?.setAttribute('transform', `rotate(${sim.knobFromRaw(v).toFixed(1)} ${pivot[0]} ${pivot[1]})`)
    onScene(() => {
      const knob = q(`[data-role="knob-${id}"]`)
      const hit = q(`[data-role="knob-hit-${id}"]`)
      const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(knob?.getAttribute('transform') || '')
      pivot = m ? [Number(m[1]), Number(m[2])] : [0, 0]
      if (hit) {
        let last: number | null = null
        const angleAt = (e: PointerEvent) => {
          const r = hit.getBoundingClientRect()
          return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
        }
        hit.addEventListener('pointerdown', (e) => {
          if (!running) return
          e.preventDefault()
          hit.setPointerCapture?.(e.pointerId)
          last = angleAt(e)
        }, { signal })
        hit.addEventListener('pointermove', (e) => {
          if (last == null) return
          const a = angleAt(e)
          let d = a - last
          if (d > 180) d -= 360
          if (d < -180) d += 360
          last = a
          setRaw(sim.rawFromKnob(sim.knobFromRaw(getRaw()) + d))
        }, { signal })
        const up = () => { last = null }
        hit.addEventListener('pointerup', up, { signal })
        hit.addEventListener('pointercancel', up, { signal })
      }
      turn(getRaw())
    })
    return turn
  }

  /** The 16x2 LCD drawn in the scene: backlight and the two text rows. */
  const lcdView = (id: string) => {
    let cur = { on: false, l1: '', l2: '' }
    const apply = () => {
      q(`[data-role="lcd-bl-${id}"]`)?.setAttribute('opacity', cur.on ? '1' : '0.28')
      ;[cur.l1, cur.l2].forEach((t, i) => {
        const row = q(`[data-role="lcd-l${i + 1}-${id}"]`)
        if (row) row.textContent = sim.lcdPad(t).replace(/ /g, '\u00a0')
      })
    }
    onScene(apply)
    return { show(on: boolean, l1: string, l2: string) { cur = { on, l1, l2 }; apply() } }
  }

  interface Runner { start(): void; stop(): void; frame?(elapsed: number, now: number): void }
  let runner: Runner

  switch (def.sim) {
    case 'blink':
      runner = {
        start: () => {},
        stop: () => setLed('led', 0),
        frame: (t) => {
          const on = sim.blinkOn(t)
          setLed('led', on ? 1 : 0)
          setStatus(say.blink(on))
        },
      }
      break

    case 'button': {
      let pressed = false
      const render = () => {
        q('[data-role="btn-cap-btn"]')?.setAttribute('transform', pressed ? 'translate(0 1.8)' : '')
        q('[data-role="btn-hit-btn"]')?.setAttribute('aria-pressed', String(pressed))
        if (!running) { setLed('led', 0); return }
        setLed('led', pressed ? 1 : 0)
        setStatus(say.button(pressed))
      }
      const set = (v: boolean) => { if (pressed !== v) { pressed = v; render() } }
      onScene(() => {
        const hit = q('[data-role="btn-hit-btn"]')
        if (!hit) return
        hit.addEventListener('pointerdown', (e) => { e.preventDefault(); hit.setPointerCapture?.((e as PointerEvent).pointerId); set(true) }, { signal })
        hit.addEventListener('pointerup', () => set(false), { signal })
        hit.addEventListener('pointercancel', () => set(false), { signal })
        hit.addEventListener('lostpointercapture', () => set(false), { signal })
        hit.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(true) } }, { signal })
        hit.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') set(false) }, { signal })
        hit.addEventListener('blur', () => set(false), { signal })
        render()
      })
      runner = { start: render, stop: () => { render() } }
      break
    }

    case 'pot': {
      let raw = start(0)
      const turn = bindKnob('pot', () => raw, (v) => setRaw(v))
      const slider = range(0, (v) => setRaw(v))
      const setRaw = (v: number) => {
        raw = v
        slider.set(v)
        turn(v)
        const r = sim.potReadout(v)
        setLed('led', running ? r.duty / 255 : 0)
        if (running) setStatus(say.pot(v))
      }
      runner = { start: () => setRaw(raw), stop: () => setLed('led', 0) }
      break
    }

    case 'lcd': {
      let raw = start(0)
      const turn = bindKnob('pot', () => raw, (v) => setRaw(v))
      const slider = range(0, (v) => setRaw(v))
      const setRaw = (v: number) => { raw = v; slider.set(v); turn(v); render() }
      const lcd = lcdView('lcd')
      const render = () => {
        if (!running) { lcd.show(false, '', ''); return }
        lcd.show(true, sim.lcdPad(sim.LCD_HELLO), sim.lcdA0Line(raw))
        setStatus(say.lcd(raw))
      }
      runner = { start: render, stop: render }
      break
    }

    case 'cds': {
      let light = start(0)
      let on = false
      range(0, (v) => { light = v; render() })
      const render = () => {
        q('[data-role="cds-glow-cds"]')?.setAttribute('opacity', String(((light / 100) * 0.9).toFixed(2)))
        if (!running) { setLed('led', 0); return }
        const raw = sim.cdsRaw(light)
        on = sim.nightLightOn(on, raw)
        setLed('led', on ? 1 : 0)
        setStatus(say.cds(light, on))
      }
      onScene(() => render())
      runner = { start: () => { on = false; render() }, stop: () => { on = false; render() } }
      break
    }

    case 'rgb': {
      const rgb: [number, number, number] = [start(0), start(1), start(2)]
      let auto: '' | 'mix' | 'wheel' = ''
      const sliders = rgb.map((_c, i) => range(i, (v) => { auto = ''; syncModes(); rgb[i] = v; render() }))
      const modes = (['mix', 'wheel'] as const).map((kind, i) => {
        const b = mode(i)
        b.addEventListener('click', () => { auto = auto === kind ? '' : kind; syncModes() }, { signal })
        return b
      })
      const syncModes = () => modes.forEach((b, i) => b.setAttribute('aria-pressed', String(auto === (['mix', 'wheel'] as const)[i])))
      const render = () => {
        sliders.forEach((s, i) => s.set(rgb[i]))
        const [r, g, b] = rgb
        const br = running ? Math.max(r, g, b) / 255 : 0
        const col = `rgb(${r},${g},${b})`
        const lit = q('[data-role="rgb-lit-rgb"]')
        const halo = q('[data-role="rgb-glow-rgb"]')
        lit?.setAttribute('fill', col)
        lit?.setAttribute('opacity', String(br))
        halo?.setAttribute('fill', col)
        halo?.setAttribute('opacity', String((br * 0.8).toFixed(2)))
        fig.setAttribute('data-led', br > 0 ? 'on' : 'off')
        if (running) setStatus(say.rgb(r, g, b))
      }
      runner = {
        start: render,
        stop: () => { auto = ''; syncModes(); render() },
        frame: (t) => {
          if (!auto) return
          const c = auto === 'mix' ? sim.colorAt(t) : sim.wheelAt(t)
          if (c[0] !== rgb[0] || c[1] !== rgb[1] || c[2] !== rgb[2]) { rgb[0] = c[0]; rgb[1] = c[1]; rgb[2] = c[2]; render() }
        },
      }
      onScene(() => render())
      break
    }

    case 'dht':
    case 'dht-lcd': {
      let temp = start(0)
      let humi = start(1)
      let failing = false
      let readN = 0
      const lcd = def.sim === 'dht-lcd' ? lcdView('lcd') : null
      range(0, (v) => { temp = v })
      range(1, (v) => { humi = v })
      const failBtn = mode(0)
      failBtn.addEventListener('click', () => { failing = !failing; failBtn.setAttribute('aria-pressed', String(failing)) }, { signal })
      const read = () => {
        const ok = !failing
        lcd?.show(true, ...sim.dhtLcdLines(ok ? temp : null, ok ? humi : null))
        setStatus(!ok ? DHT_FAIL : lcd ? say.dhtLcd(temp, humi) : say.dht(temp, humi))
      }
      runner = {
        start: () => { readN = 0; lcd?.show(true, '', ''); setStatus(DHT_WAIT) },
        stop: () => lcd?.show(false, '', ''),
        frame: (t) => {
          const n = Math.floor(t / sim.DHT_READ_MS)
          if (n !== readN) { readN = n; read() }
        },
      }
      lcd?.show(false, '', '')
      break
    }

    case 'joystick': {
      let x = start(0)
      let y = start(1)
      let pressed = false
      const sx = range(0, (v) => { x = v; render() })
      const sy = range(1, (v) => { y = v; render() })
      const sw = mode(0)
      const setSw = (v: boolean) => { if (pressed !== v) { pressed = v; sw.setAttribute('aria-pressed', String(v)); render() } }
      sw.addEventListener('pointerdown', (e) => { e.preventDefault(); sw.setPointerCapture?.(e.pointerId); setSw(true) }, { signal })
      sw.addEventListener('pointerup', () => setSw(false), { signal })
      sw.addEventListener('pointercancel', () => setSw(false), { signal })
      sw.addEventListener('lostpointercapture', () => setSw(false), { signal })
      sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSw(true) } }, { signal })
      sw.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') setSw(false) }, { signal })
      sw.addEventListener('blur', () => setSw(false), { signal })
      const render = () => {
        sx.set(x); sy.set(y)
        q('[data-role="stick-joy"]')?.setAttribute('transform', `translate(${(sim.joyPos(x) * JOY_TRAVEL).toFixed(1)} ${(sim.joyPos(y) * JOY_TRAVEL).toFixed(1)}) scale(${pressed ? 0.94 : 1})`)
        if (running) setStatus(sim.joyLine(x, y, pressed))
      }
      onScene(() => {
        const hit = q('[data-role="stick-hit-joy"]')
        if (!hit) return
        let dragging = false
        const move = (e: PointerEvent) => {
          const r = hit.getBoundingClientRect()
          const k = (34 / JOY_TRAVEL) / (r.width / 2)
          x = sim.joyRaw((e.clientX - (r.left + r.width / 2)) * k)
          y = sim.joyRaw((e.clientY - (r.top + r.height / 2)) * k)
          render()
        }
        hit.addEventListener('pointerdown', (e) => { if (!running) return; e.preventDefault(); hit.setPointerCapture?.(e.pointerId); dragging = true; move(e) }, { signal })
        hit.addEventListener('pointermove', (e) => { if (dragging) move(e) }, { signal })
        const up = () => { if (dragging) { dragging = false; x = 512; y = 512; render() } } // the spring returns the stick to the middle
        hit.addEventListener('pointerup', up, { signal })
        hit.addEventListener('pointercancel', up, { signal })
        render()
      })
      runner = { start: render, stop: () => { x = 512; y = 512; pressed = false; sw.setAttribute('aria-pressed', 'false'); render() } }
      break
    }

    case 'motor': {
      let speed = start(0)
      let follow = false
      let angle = 0
      let lastNow = 0
      let lastStep = 0
      let pivot: [number, number] = [0, 0]
      onScene(() => {
        const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(q('[data-role="spin-motor"]')?.getAttribute('transform') || '')
        pivot = m ? [Number(m[1]), Number(m[2])] : [0, 0]
      })
      const slider = range(0, (v) => { follow = false; syncFollow(); speed = v; report() })
      const followBtn = mode(0)
      const syncFollow = () => followBtn.setAttribute('aria-pressed', String(follow))
      followBtn.addEventListener('click', () => { follow = !follow; syncFollow() }, { signal })
      const turns = () => { const p = sim.motorPins(speed); return Math.max(p.ia, p.ib) >= sim.STALL_PWM }
      const report = () => {
        slider.set(speed)
        if (running) setStatus(say.motor(speed))
      }
      const draw = () => q('[data-role="spin-motor"]')?.setAttribute('transform', `rotate(${(angle % 360).toFixed(1)} ${pivot[0]} ${pivot[1]})`)
      runner = {
        start: () => { lastNow = 0; report() },
        stop: () => { follow = false; syncFollow(); speed = 0; report(); draw() },
        frame: (t, now) => {
          if (follow) { const v = sim.motorLoopAt(t); if (v !== speed) { speed = v; report() } }
          const dt = lastNow ? now - lastNow : 0
          lastNow = now
          if (reducedMotion()) { angle = speed === 0 || !turns() ? 0 : speed > 0 ? 25 : -25; draw(); return } // no spinning: a tilt shows the direction
          const omega = turns() ? (Math.sign(speed) * (Math.abs(speed) / 255) * 900) : 0
          if (lite()) { // few, stepped updates instead of a smooth spin
            if (now - lastStep < 150) return
            angle += (omega * (now - lastStep)) / 1000
            lastStep = now
          } else angle += (omega * dt) / 1000
          draw()
        },
      }
      break
    }

    case 'ultrasonic':
    case 'alarm': {
      let cm = start(0)
      const alarm = sim.createAlarm()
      range(0, (v) => { cm = v; moveObject(v); if (def.sim === 'ultrasonic') report() })
      const report = () => setStatus(say.ultrasonic(cm))
      onScene(() => moveObject(cm))
      runner = {
        start: () => { if (def.sim === 'ultrasonic') report() },
        stop: () => { setLed('led', 0); setWaves('bz', false) },
        frame: def.sim === 'alarm'
          ? (_t, now) => {
              const out = alarm(cm, now)
              setLed('led', out.led ? 1 : 0)
              setWaves('bz', out.buzzer)
              setStatus(say.alarm(cm))
            }
          : undefined,
      }
      break
    }

    case 'servo': {
      let pivot: [number, number] = [0, 0]
      onScene(() => {
        const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(q('[data-role="horn-sv"]')?.getAttribute('transform') || '')
        pivot = m ? [Number(m[1]), Number(m[2])] : [0, 0]
      })
      let angle = start(0)
      const turn = (v: number) => {
        angle = v
        q('[data-role="horn-sv"]')?.setAttribute('transform', `rotate(${-v} ${pivot[0]} ${pivot[1]})`)
        if (running) setStatus(say.servo(v))
      }
      range(0, turn)
      onScene(() => turn(angle))
      runner = { start: () => turn(angle), stop: () => {} }
      break
    }

    case 'buzzer':
      runner = {
        start: () => {},
        stop: () => setWaves('bz', false),
        frame: (t) => {
          const n = sim.melodyAt(t)
          setWaves('bz', !!n?.sounding)
          setStatus(say.buzzer(n))
        },
      }
      break
  }

  lock(true)
  // The frame loop only runs while the sim is on AND the figure is on screen AND the tab is visible; the sim clock
  // does not advance while paused, so a resumed sim continues from where it stopped.
  let onScreen = true
  let t0 = 0
  let pausedTotal = 0
  let pausedAt = 0
  const tick = (now: number) => {
    const n = now - pausedTotal
    runner.frame?.(n - t0, n)
    raf = requestAnimationFrame(tick)
  }
  function syncLoop() {
    const should = running && onScreen && !document.hidden && !!runner.frame
    if (should && !raf) {
      if (pausedAt) { pausedTotal += performance.now() - pausedAt; pausedAt = 0 }
      raf = requestAnimationFrame(tick)
    } else if (!should && raf) {
      cancelAnimationFrame(raf)
      raf = 0
      if (running) pausedAt = performance.now()
    }
    fig.toggleAttribute('data-offscreen', !onScreen)
  }
  document.addEventListener('visibilitychange', syncLoop, { signal })
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; syncLoop() })
    io.observe(fig)
    cleanups.push(() => io.disconnect())
  }
  function setRunning(on: boolean) {
    if (on) {
      // a scene must exist before it can be simulated (a keyboard user can reach the play button first); if it cannot be
      // built, nothing changes: the button keeps saying ▶ and the controls stay locked
      try { attach() } catch (err) { console.error('circuit scene failed to build', def.id, err); return }
    }
    running = on
    btnPlay.textContent = on ? '■ 정지' : '▶ 시뮬레이션'
    btnPlay.setAttribute('aria-pressed', String(on))
    fig.setAttribute('data-sim', on ? 'on' : 'off')
    lock(!on)
    cancelAnimationFrame(raf)
    raf = 0
    pausedAt = 0
    pausedTotal = 0
    if (on) {
      t0 = performance.now()
      runner.start()
      syncLoop()
    } else {
      runner.stop()
      setStatus(IDLE[def.sim])
    }
  }
  btnPlay.addEventListener('click', () => setRunning(!running), { signal })

  let disposed = false
  const attach = () => {
    if (svg || disposed) return
    plane.innerHTML = buildScene(def, uid, aria)
    svg = plane.querySelector('svg')
    sceneHooks.splice(0).forEach((fn) => fn())
    applyStepper() // stepper state and a row highlighted (hover / focus) before the scene existed
  }
  const dispose = () => {
    if (disposed) return // a scene that failed to build disposes its figure early; unmount must not run the cleanups twice
    disposed = true
    ac.abort()
    cancelAnimationFrame(raf)
    fig.removeAttribute('data-offscreen')
    cleanups.forEach((c) => c())
  }
  return { attach, plane, dispose }
}

/**
 * Brings every circuit figure under `root` to life. The chrome of each figure is already in the page and is hydrated at
 * once; its SVG scene (~50 KB, a few hundred DOM nodes) is built only when the stage box nears the viewport. Every part
 * of a figure has its final size from the page's own markup and CSS, so neither step moves anything.
 * Returns a cleanup that puts the static figures back.
 */
export function mountCircuits(root: HTMLElement): () => void {
  const mounted: Mounted[] = []
  const pending = new Map<Element, Mounted>()
  const build = (m: Mounted) => {
    try { m.attach() } catch (err) { console.error('circuit scene failed to build', err); m.dispose() }
  }
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return
        io!.unobserve(en.target)
        const m = pending.get(en.target)
        pending.delete(en.target)
        if (m) build(m)
      }), { rootMargin: '300px 0px' })
    : null
  root.querySelectorAll<HTMLElement>('figure.circuit[data-circuit]').forEach((fig) => {
    const def = circuitById(fig.getAttribute('data-circuit') || '')
    const m = def ? mountOne(fig, def) : null
    if (!m) return
    mounted.push(m)
    if (io) { pending.set(m.plane, m); io.observe(m.plane) } else build(m)
  })
  return () => { io?.disconnect(); pending.clear(); mounted.forEach((m) => m.dispose()) }
}
