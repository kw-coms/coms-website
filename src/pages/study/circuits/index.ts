// Runtime for the <figure class="circuit" data-circuit="..."> mount points of a study fragment:
// draws the scene, adds the 3D tilt, the simulation, the assembly stepper and the table <-> drawing links.
// Loaded on demand from studyDemos.ts (only when a fragment contains such a figure).
import { circuitById, type CircuitDef } from './definitions'
import { JOY_TRAVEL } from './parts'
import { buildScene } from './scene'
import * as sim from './sim'

let counter = 0
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Low-power mode (set site-wide on machines without graphics acceleration): flat view, no SVG filters, no continuous animation. */
const lite = () => document.documentElement.dataset.perf === 'lite'

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string, attrs: Record<string, string> = {}) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v))
  return e
}
const button = (cls: string, text: string, label?: string) => {
  const b = h('button', `cb ${cls}`, text, { type: 'button' })
  if (label) b.setAttribute('aria-label', label)
  return b
}

const IDLE: Record<string, string> = {
  blink: '▶ 시뮬레이션을 누르면 스케치처럼 D8이 0.5초마다 HIGH/LOW로 바뀌고 LED가 깜빡입니다.',
  button: '▶ 시뮬레이션을 누른 뒤 그림 속 버튼을 눌러 보세요. (마우스/터치로 누르고 있기, 또는 포커스 후 Space/Enter)',
  pot: '▶ 시뮬레이션을 누른 뒤 가변저항 손잡이를 돌리거나 슬라이더를 움직여 보세요.',
  ultrasonic: '▶ 시뮬레이션을 누른 뒤 슬라이더로 물체의 거리를 바꿔 보세요.',
  servo: '▶ 시뮬레이션을 누른 뒤 슬라이더로 각도를 바꿔 보세요.',
  buzzer: '▶ 시뮬레이션을 누르면 도레미파솔이 연주되는 동안 소리 파동이 표시됩니다. (실제 소리는 나지 않아요)',
  alarm: '▶ 시뮬레이션을 누른 뒤 슬라이더로 물체의 거리를 바꿔 보세요. 최종 스케치와 같은 구간·간격으로 동작합니다.',
  cds: '▶ 시뮬레이션을 누른 뒤 슬라이더로 주변 밝기를 바꿔 보세요. 야간등 스케치처럼 analogRead가 300 아래로 내려가면 LED가 켜집니다.',
  rgb: '▶ 시뮬레이션을 누른 뒤 R·G·B 슬라이더(analogWrite 값)를 움직이거나, 스케치의 색 순환을 재생해 보세요.',
  lcd: '▶ 시뮬레이션을 누르면 LCD에 글자가 나타납니다. 가변저항 손잡이나 슬라이더로 둘째 줄의 A0 값을 바꿔 보세요.',
  dht: '▶ 시뮬레이션을 누른 뒤 슬라이더로 온도·습도를 바꿔 보세요. 스케치처럼 2초마다 한 번 읽어 시리얼에 출력합니다.',
  'dht-lcd': '▶ 시뮬레이션을 누른 뒤 슬라이더로 온도·습도를 바꿔 보세요. 2초마다 읽어 LCD와 시리얼에 함께 표시합니다.',
  joystick: '▶ 시뮬레이션을 누른 뒤 그림 속 스틱을 끌거나 슬라이더를 움직여 보세요. 스틱 누르기 버튼은 SW(D7)입니다.',
  motor: '▶ 시뮬레이션을 누른 뒤 슬라이더로 setMotor 속도(−255~255)를 바꾸거나, 스케치의 loop()를 재생해 보세요.',
}

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

function mountOne(fig: HTMLElement, def: CircuitDef): () => void {
  const ac = new AbortController()
  const { signal } = ac
  const uid = `cc${++counter}`
  const aria = fig.getAttribute('aria-label') || ''
  const caption = Array.from(fig.children).find((c) => c.tagName === 'FIGCAPTION') ?? null
  const cleanups: Array<() => void> = []
  let raf = 0

  /* ---------- DOM ---------- */
  const bar = h('div', 'circuit-bar', undefined, { role: 'group', 'aria-label': '회로 그림 조작' })
  const btnPlay = button('cb-play', '▶ 시뮬레이션')
  const btnView = button('cb-view', '평면으로 보기')
  const btnSteps = button('cb-steps', '조립 순서 보기')
  btnSteps.setAttribute('aria-pressed', 'false')
  bar.append(btnPlay, btnView, btnSteps)

  const stepper = h('div', 'circuit-stepper', undefined, { role: 'group', 'aria-label': '조립 순서' })
  const btnPrev = button('cb-prev', '◀', '이전 단계')
  const progress = h('span', 'circuit-progress', '', { role: 'status', 'aria-live': 'polite' })
  const btnNext = button('cb-next', '▶', '다음 단계')
  const btnAll = button('cb-all', '전체 보기')
  stepper.append(btnPrev, progress, btnNext, btnAll)
  stepper.hidden = true

  const stage = h('div', 'circuit-stage', undefined, {
    tabindex: '0', role: 'group',
    'aria-label': '회로 그림. 드래그하거나 방향키로 각도를 바꾸고, 더블클릭 또는 Home 키로 처음 각도로 돌립니다.',
  })
  const plane = h('div', 'circuit-plane')
  plane.style.maxWidth = `${Math.round(def.size[0] * 1.12)}px`
  plane.innerHTML = buildScene(def, uid, aria)
  stage.append(plane)
  const svg = plane.querySelector('svg')!

  const ctl = h('div', 'circuit-ctl')
  // the visible status line is plain text (it changes every frame while a sim runs); screen readers get a separate, debounced live region
  const status = h('p', 'circuit-status', IDLE[def.sim])
  const live = h('div', 'circuit-live', undefined, { role: 'status', 'aria-live': 'polite' })
  const mounted: HTMLElement[] = [bar, stepper, stage, ctl, status, live]
  fig.insertBefore(live, caption)
  fig.insertBefore(status, live)
  fig.insertBefore(ctl, status)
  fig.insertBefore(stage, ctl)
  fig.insertBefore(stepper, stage)
  fig.insertBefore(bar, stepper)
  fig.classList.add('is-live')
  fig.setAttribute('data-sim', 'off')
  cleanups.push(() => { mounted.forEach((n) => n.remove()); fig.classList.remove('is-live'); fig.removeAttribute('data-sim'); ;['data-led', 'data-sound'].forEach((a) => fig.removeAttribute(a)) })

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

  const q = <T extends Element = SVGElement>(sel: string) => svg.querySelector<T>(sel)
  const qa = (sel: string) => Array.from(svg.querySelectorAll<SVGElement>(sel))

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
    svg.querySelectorAll('.is-hl').forEach((n) => n.classList.remove('is-hl'))
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
  const restoreHl = () => hl(stepper$.on ? stepper$.n - 1 : null)

  if (linked) {
    if (caption) {
      const hint = h('span', 'circuit-hint', '위 표의 줄에 마우스를 올리거나 포커스하면 그림에서 해당 선과 부품이 강조됩니다. 키보드는 Tab으로 표에 들어가 위·아래 방향키로 줄을 옮깁니다.', { id: `${uid}-hint` })
      caption.append(hint)
      cleanups.push(() => hint.remove())
    }
    // one tab stop per table (roving tabindex): arrow keys move between the rows
    if (caption) rows[0]?.closest('table')?.setAttribute('aria-describedby', `${uid}-hint`) // described once, on the table
    const setRowTab = (i: number) => rows.forEach((r, k) => r.setAttribute('tabindex', k === i ? '0' : '-1'))
    rows.forEach((row, i) => {
      row.setAttribute('tabindex', i === 0 ? '0' : '-1')
      row.classList.add('circuit-row')
      row.addEventListener('pointerenter', () => hl(i), { signal })
      row.addEventListener('pointerleave', restoreHl, { signal })
      row.addEventListener('focus', () => { setRowTab(i); hl(i) }, { signal })
      row.addEventListener('blur', restoreHl, { signal })
      row.addEventListener('keydown', (e) => {
        const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : -1
        if (to < 0 || to >= rows.length) return
        e.preventDefault()
        rows[to].focus()
      }, { signal })
    })
    def.wires.forEach((_w, wi) => {
      const el = wireEl(wi)
      const si = stepOfWire.get(wi)
      if (!el || si == null) return
      el.addEventListener('pointerenter', () => { clearHl(); el.classList.add('is-hl'); rows[si].classList.add('circuit-row-on') }, { signal })
      el.addEventListener('pointerleave', restoreHl, { signal })
    })
    cleanups.push(() => rows.forEach((row) => {
      row.removeAttribute('tabindex'); rows[0]?.closest('table')?.removeAttribute('aria-describedby')
      row.classList.remove('circuit-row', 'circuit-row-on', 'circuit-row-current')
    }))
  } else {
    btnSteps.hidden = true
  }

  function applyStepper() {
    const { on, n } = stepper$
    stepper.hidden = !on
    btnSteps.setAttribute('aria-pressed', String(on))
    svg.querySelectorAll('.cstep-off').forEach((x) => x.classList.remove('cstep-off'))
    rows.forEach((r, i) => r.classList.toggle('circuit-row-current', on && i === n - 1))
    if (on) {
      svg.querySelectorAll<SVGElement>('[data-cpart]').forEach((x) => {
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
  btnSteps.addEventListener('click', () => { stepper$.on = !stepper$.on; stepper$.n = 1; applyStepper() }, { signal })
  btnAll.addEventListener('click', () => { stepper$.on = false; applyStepper(); btnSteps.focus() }, { signal })
  btnPrev.addEventListener('click', () => { stepper$.n = Math.max(1, stepper$.n - 1); applyStepper() }, { signal })
  btnNext.addEventListener('click', () => { stepper$.n = Math.min(def.steps.length, stepper$.n + 1); applyStepper() }, { signal })
  cleanups.push(() => rows.forEach((r) => r.classList.remove('circuit-row-current')))

  /* ---------- simulation ---------- */
  let running = false
  const range = (label: string, min: number, max: number, value: number, unit: string, onInput: (v: number) => void) => {
    const wrap = h('label', 'circuit-range')
    const text = h('span', 'circuit-range-label', label)
    const input = h('input', null, undefined, { type: 'range', min: String(min), max: String(max), step: '1', value: String(value) })
    const out = h('output', 'circuit-range-out', `${value}${unit}`)
    input.addEventListener('input', () => { const v = Number(input.value); out.textContent = `${v}${unit}`; onInput(v) }, { signal })
    wrap.append(text, input, out)
    ctl.append(wrap)
    return { input, out, set(v: number) { input.value = String(v); out.textContent = `${v}${unit}` } }
  }
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
    const knob = q(`[data-role="knob-${id}"]`)
    const hit = q(`[data-role="knob-hit-${id}"]`)
    const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(knob?.getAttribute('transform') || '')
    const pivot: [number, number] = m ? [Number(m[1]), Number(m[2])] : [0, 0]
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
    return (v: number) => knob?.setAttribute('transform', `rotate(${sim.knobFromRaw(v).toFixed(1)} ${pivot[0]} ${pivot[1]})`)
  }

  /** The 16x2 LCD drawn in the scene: backlight and the two text rows. */
  const lcdView = (id: string) => {
    const bl = q(`[data-role="lcd-bl-${id}"]`)
    const rows = [q(`[data-role="lcd-l1-${id}"]`), q(`[data-role="lcd-l2-${id}"]`)]
    return {
      show(on: boolean, l1: string, l2: string) {
        bl?.setAttribute('opacity', on ? '1' : '0.28')
        ;[l1, l2].forEach((t, i) => { if (rows[i]) rows[i]!.textContent = sim.lcdPad(t).replace(/ /g, '\u00a0') })
      },
    }
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
          setStatus(`digitalWrite(8, ${on ? 'HIGH' : 'LOW'}) → D8 = ${on ? '5V' : '0V'}, LED ${on ? '켜짐' : '꺼짐'}  (delay(${sim.BLINK_MS})마다 반복)`)
        },
      }
      break

    case 'button': {
      let pressed = false
      const hit = q('[data-role="btn-hit-btn"]')
      const cap = q('[data-role="btn-cap-btn"]')
      const render = () => {
        cap?.setAttribute('transform', pressed ? 'translate(0 1.8)' : '')
        hit?.setAttribute('aria-pressed', String(pressed))
        const read = sim.buttonRead(pressed)
        if (!running) { setLed('led', 0); return }
        setLed('led', pressed ? 1 : 0)
        setStatus(`D2 = ${read} (${pressed ? '눌림 → GND와 연결' : '안 눌림, 내부 풀업이 HIGH로 당김'}) → digitalWrite(8, ${pressed ? 'HIGH' : 'LOW'}), LED ${pressed ? '켜짐' : '꺼짐'}`)
      }
      const set = (v: boolean) => { if (pressed !== v) { pressed = v; render() } }
      if (hit) {
        hit.addEventListener('pointerdown', (e) => { e.preventDefault(); hit.setPointerCapture?.((e as PointerEvent).pointerId); set(true) }, { signal })
        hit.addEventListener('pointerup', () => set(false), { signal })
        hit.addEventListener('pointercancel', () => set(false), { signal })
        hit.addEventListener('lostpointercapture', () => set(false), { signal })
        hit.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(true) } }, { signal })
        hit.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') set(false) }, { signal })
        hit.addEventListener('blur', () => set(false), { signal })
      }
      runner = { start: render, stop: () => { render() } }
      break
    }

    case 'pot': {
      let raw = 512
      const turn = bindKnob('pot', () => raw, (v) => setRaw(v))
      const slider = range('가변저항 값 (analogRead)', 0, 1023, raw, '', (v) => setRaw(v))
      const setRaw = (v: number) => {
        raw = v
        slider.set(v)
        turn(v)
        const r = sim.potReadout(v)
        setLed('led', running ? r.duty / 255 : 0)
        if (running) setStatus(`analogRead(A0) = ${r.raw} (약 ${r.volts.toFixed(2)}V) → map → analogWrite(9, ${r.duty}) : LED 밝기 ${Math.round((r.duty / 255) * 100)}%`)
      }
      runner = { start: () => setRaw(raw), stop: () => setLed('led', 0) }
      break
    }

    case 'lcd': {
      let raw = 512
      const turn = bindKnob('pot', () => raw, (v) => setRaw(v))
      const slider = range('가변저항 값 (A0)', 0, 1023, raw, '', (v) => setRaw(v))
      const setRaw = (v: number) => { raw = v; slider.set(v); turn(v); render() }
      const lcd = lcdView('lcd')
      const render = () => {
        if (!running) { lcd.show(false, '', ''); return }
        lcd.show(true, sim.lcdPad(sim.LCD_HELLO), sim.lcdA0Line(raw))
        setStatus(`lcd.print("${sim.LCD_HELLO}") 첫 줄 / 둘째 줄: "A0 = ${raw}" (analogRead(A0) = ${raw}, 0.2초마다 갱신)`)
      }
      runner = { start: render, stop: render }
      break
    }

    case 'cds': {
      let light = 70
      let on = false
      const glow = q('[data-role="cds-glow-cds"]')
      range('주변 밝기', 0, 100, light, '%', (v) => { light = v; render() })
      const render = () => {
        glow?.setAttribute('opacity', String(((light / 100) * 0.9).toFixed(2)))
        if (!running) { setLed('led', 0); return }
        const raw = sim.cdsRaw(light)
        on = sim.nightLightOn(on, raw)
        setLed('led', on ? 1 : 0)
        setStatus(`light = ${raw}  LED ${on ? 'ON' : 'OFF'}   (CDS 약 ${sim.cdsKohm(light).toFixed(1)}kΩ, A0 약 ${((raw * 5) / 1023).toFixed(2)}V, 켜는 값 ${sim.DARK_ON} / 끄는 값 ${sim.DARK_OFF})`)
      }
      render()
      runner = { start: () => { on = false; render() }, stop: () => { on = false; render() } }
      break
    }

    case 'rgb': {
      const rgb: [number, number, number] = [255, 0, 0]
      let auto: '' | 'mix' | 'wheel' = ''
      const lit = q('[data-role="rgb-lit-rgb"]')
      const halo = q('[data-role="rgb-glow-rgb"]')
      const sliders = ['R (D9)', 'G (D10)', 'B (D11)'].map((l, i) => range(l, 0, 255, rgb[i], '', (v) => { auto = ''; syncModes(); rgb[i] = v; render() }))
      const modes = (['mix', 'wheel'] as const).map((kind) => {
        const b = button('cb-mode', kind === 'mix' ? '색 섞기 스케치 재생' : '무지개 스케치 재생')
        b.setAttribute('aria-pressed', 'false')
        b.addEventListener('click', () => { auto = auto === kind ? '' : kind; syncModes() }, { signal })
        ctl.append(b)
        return b
      })
      const syncModes = () => modes.forEach((b, i) => b.setAttribute('aria-pressed', String(auto === (['mix', 'wheel'] as const)[i])))
      const render = () => {
        sliders.forEach((s, i) => s.set(rgb[i]))
        const [r, g, b] = rgb
        const br = running ? Math.max(r, g, b) / 255 : 0
        const col = `rgb(${r},${g},${b})`
        lit?.setAttribute('fill', col)
        lit?.setAttribute('opacity', String(br))
        halo?.setAttribute('fill', col)
        halo?.setAttribute('opacity', String((br * 0.8).toFixed(2)))
        fig.setAttribute('data-led', br > 0 ? 'on' : 'off')
        if (running) setStatus(`analogWrite(9, ${r}) · analogWrite(10, ${g}) · analogWrite(11, ${b}) → ${sim.colorName(r, g, b) ?? `rgb(${r}, ${g}, ${b})`}`)
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
      render()
      break
    }

    case 'dht':
    case 'dht-lcd': {
      let temp = 24
      let humi = 45
      let failing = false
      let readN = 0
      const lcd = def.sim === 'dht-lcd' ? lcdView('lcd') : null
      range('온도', 0, 50, temp, '°C', (v) => { temp = v })
      range('습도', 20, 80, humi, '%', (v) => { humi = v })
      const failBtn = button('cb-mode', '읽기 실패 만들기 (NaN)')
      failBtn.setAttribute('aria-pressed', 'false')
      failBtn.addEventListener('click', () => { failing = !failing; failBtn.setAttribute('aria-pressed', String(failing)) }, { signal })
      ctl.append(failBtn)
      const read = () => {
        const ok = !failing
        lcd?.show(true, ...sim.dhtLcdLines(ok ? temp : null, ok ? humi : null))
        setStatus(!ok ? 'DHT read failed  (isnan 검사에 걸려 return)' : lcd ? `Serial: ${sim.dhtSerialShort(temp, humi)}` : sim.dhtSerial(temp, humi))
      }
      runner = {
        start: () => { readN = 0; lcd?.show(true, '', ''); setStatus('delay(2000) 중… 첫 측정까지 2초') },
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
      let x = 512
      let y = 512
      let pressed = false
      const stick = q('[data-role="stick-joy"]')
      const hit = q('[data-role="stick-hit-joy"]')
      const sx = range('X축 (A0)', 0, 1023, x, '', (v) => { x = v; render() })
      const sy = range('Y축 (A1)', 0, 1023, y, '', (v) => { y = v; render() })
      const sw = button('cb-mode', '스틱 누르기 (SW)')
      sw.setAttribute('aria-pressed', 'false')
      const setSw = (v: boolean) => { if (pressed !== v) { pressed = v; sw.setAttribute('aria-pressed', String(v)); render() } }
      sw.addEventListener('pointerdown', (e) => { e.preventDefault(); sw.setPointerCapture?.(e.pointerId); setSw(true) }, { signal })
      sw.addEventListener('pointerup', () => setSw(false), { signal })
      sw.addEventListener('pointercancel', () => setSw(false), { signal })
      sw.addEventListener('lostpointercapture', () => setSw(false), { signal })
      sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSw(true) } }, { signal })
      sw.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') setSw(false) }, { signal })
      sw.addEventListener('blur', () => setSw(false), { signal })
      ctl.append(sw)
      const render = () => {
        sx.set(x); sy.set(y)
        stick?.setAttribute('transform', `translate(${(sim.joyPos(x) * JOY_TRAVEL).toFixed(1)} ${(sim.joyPos(y) * JOY_TRAVEL).toFixed(1)}) scale(${pressed ? 0.94 : 1})`)
        if (running) setStatus(sim.joyLine(x, y, pressed))
      }
      if (hit) {
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
      }
      runner = { start: render, stop: () => { x = 512; y = 512; pressed = false; sw.setAttribute('aria-pressed', 'false'); render() } }
      render()
      break
    }

    case 'motor': {
      let speed = 0
      let follow = false
      let angle = 0
      let lastNow = 0
      let lastStep = 0
      const spin = q('[data-role="spin-motor"]')
      const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(spin?.getAttribute('transform') || '')
      const pivot: [number, number] = m ? [Number(m[1]), Number(m[2])] : [0, 0]
      const slider = range('속도 setMotor(speed)', -255, 255, speed, '', (v) => { follow = false; syncFollow(); speed = v; report() })
      const followBtn = button('cb-mode', 'loop() 스케치 재생')
      followBtn.setAttribute('aria-pressed', 'false')
      const syncFollow = () => followBtn.setAttribute('aria-pressed', String(follow))
      followBtn.addEventListener('click', () => { follow = !follow; syncFollow() }, { signal })
      ctl.append(followBtn)
      const turns = () => { const p = sim.motorPins(speed); return Math.max(p.ia, p.ib) >= sim.STALL_PWM }
      const report = () => {
        slider.set(speed)
        if (!running) return
        const p = sim.motorPins(speed)
        const pwm = Math.max(p.ia, p.ib)
        setStatus(`setMotor(${speed}) → analogWrite(5, ${p.ia}) · analogWrite(6, ${p.ib}) : ${speed === 0 ? '정지' : !turns() ? `PWM ${pwm}는 너무 낮아 웅 소리만 나고 돌지 않음` : `${speed > 0 ? '정방향' : '역방향'}, 속도 ${Math.round((pwm / 255) * 100)}%`}`)
      }
      const draw = () => spin?.setAttribute('transform', `rotate(${(angle % 360).toFixed(1)} ${pivot[0]} ${pivot[1]})`)
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
      let cm = def.sim === 'alarm' ? 60 : 40
      const alarm = sim.createAlarm()
      const slider = range('물체까지 거리', 2, 200, cm, 'cm', (v) => { cm = v; moveObject(v); if (def.sim === 'ultrasonic') report() })
      void slider
      const report = () => {
        const us = sim.echoMicros(cm)
        setStatus(`Echo가 HIGH였던 시간 = ${us}µs → ${us} × 0.034 / 2 = ${sim.cmFromMicros(us).toFixed(1)}cm`)
      }
      moveObject(cm)
      runner = {
        start: () => { if (def.sim === 'ultrasonic') report() },
        stop: () => { setLed('led', 0); setWaves('bz', false) },
        frame: def.sim === 'alarm'
          ? (_t, now) => {
              const out = alarm(cm, now)
              setLed('led', out.led ? 1 : 0)
              setWaves('bz', out.buzzer)
              const zone = sim.alarmZone(cm)
              setStatus(zone === 'quiet'
                ? `거리 ${cm}cm: ${sim.FAR_CM}cm보다 멀다 → 조용 (부저·LED 꺼짐)`
                : zone === 'alarm'
                  ? `거리 ${cm}cm: ${sim.NEAR_CM}cm 이내 → 경보! 부저가 계속 울리고 LED가 켜짐`
                  : `거리 ${cm}cm: 삑 간격 ${sim.beepInterval(cm)}ms (map(${cm}, ${sim.NEAR_CM}, ${sim.FAR_CM}, ${sim.MIN_INTERVAL}, ${sim.MAX_INTERVAL}))`)
            }
          : undefined,
      }
      break
    }

    case 'servo': {
      const horn = q('[data-role="horn-sv"]')
      const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(horn?.getAttribute('transform') || '')
      const pivot: [number, number] = m ? [Number(m[1]), Number(m[2])] : [0, 0]
      let angle = 90
      const turn = (v: number) => {
        angle = v
        horn?.setAttribute('transform', `rotate(${-v} ${pivot[0]} ${pivot[1]})`)
        if (running) setStatus(`myServo.write(${v}) → 서보 혼이 ${v}°로 이동`)
      }
      range('각도', 0, 180, angle, '°', turn)
      turn(angle)
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
          setStatus(n
            ? n.sounding
              ? `tone(8, ${sim.NOTES[n.note]}, ${sim.TONE_MS}) → ${sim.NOTE_NAMES[n.note]} (${sim.NOTES[n.note]}Hz)`
              : `delay(${sim.NOTE_STEP_MS}) 중: 소리가 끝나고 다음 음을 기다림`
            : `noTone(8) 후 delay(${sim.REST_MS}): 쉬는 중`)
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
  btnPlay.setAttribute('aria-pressed', 'false')

  return () => {
    ac.abort()
    cancelAnimationFrame(raf)
    fig.removeAttribute('data-offscreen')
    cleanups.forEach((c) => c())
  }
}

/** Height of everything around the drawing (bar, controls, status line, caption hint) per circuit: [wide, narrow (<= 520px)], measured from the mounted figures, so the placeholder reserves the final height. */
const PLACEHOLDER_EXTRA: Record<string, [number, number]> = {
  'led-blink': [166, 207], 'button-led': [166, 227], 'pot-led': [199, 287], ultrasonic: [199, 286], servo: [199, 288], buzzer: [166, 210], alarm: [185, 291],
  'cds-night': [215, 307], 'rgb-led': [241, 504], 'lcd-i2c': [185, 310], dht11: [241, 428], 'dht11-lcd': [227, 430], joystick: [241, 428], 'dc-motor': [210, 348],
}

/**
 * Registers every circuit figure under `root` and builds each scene only when it nears the viewport (a scene is ~50 KB of
 * SVG, so building all of them at load costs thousands of DOM nodes). Until then a placeholder of the final aspect ratio
 * keeps the layout from jumping. Returns a cleanup that removes everything again.
 */
export function mountCircuits(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = []
  const pending = new Map<Element, () => void>()
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return
        io!.unobserve(en.target)
        pending.get(en.target)?.()
        pending.delete(en.target)
      }), { rootMargin: '300px 0px' })
    : null
  const figs = Array.from(root.querySelectorAll<HTMLElement>('figure.circuit[data-circuit]'))
  // read first, write after: which figures sit wholly above the viewport and how tall they are right now
  const was = figs.map((f) => { const r = f.getBoundingClientRect(); return { above: r.bottom <= 0, h: r.height } })
  figs.forEach((fig) => {
    const def = circuitById(fig.getAttribute('data-circuit') || '')
    if (!def) return
    const mount = () => {
      const before = fig.getBoundingClientRect()
      try {
        ph?.remove()
        cleanups.push(mountOne(fig, def))
      } catch {
        // a broken scene must not take the others down: put the static figure back and carry on
        ph?.remove()
        fig.querySelectorAll(':scope > .circuit-bar, :scope > .circuit-stepper, :scope > .circuit-stage, :scope > .circuit-ctl, :scope > .circuit-status, :scope > .circuit-live').forEach((n) => n.remove())
        fig.classList.remove('is-live')
        fig.removeAttribute('data-sim')
        return
      }
      // A figure wholly above the viewport changes height here (placeholder vs real): scroll by the difference so the text being read stays put
      // (Chrome and Firefox anchor the scroll position themselves, Safari does not).
      if (before.bottom <= 0) {
        const delta = fig.getBoundingClientRect().height - before.height
        if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, left: 0, behavior: 'instant' as ScrollBehavior })
      }
    }
    let ph: HTMLElement | null = null
    if (io) {
      ph = h('div', 'circuit-ph', undefined, { 'aria-hidden': 'true' })
      ph.style.aspectRatio = `${def.size[0]} / ${def.size[1]}`
      ph.style.maxWidth = `${Math.round(def.size[0] * 1.12)}px`
      const extra = PLACEHOLDER_EXTRA[def.id] ?? [190, 350]
      ph.style.setProperty('--ph-x', `${extra[0]}px`)
      ph.style.setProperty('--ph-xm', `${extra[1]}px`)
      fig.insertBefore(ph, Array.from(fig.children).find((c) => c.tagName === 'FIGCAPTION') ?? null)
      pending.set(fig, mount)
      io.observe(fig)
    } else mount()
    cleanups.push(() => ph?.remove())
  })
  // the placeholders were inserted after the browser may already have jumped to a #hash or restored a scroll position:
  // keep the text on screen where it was
  let grown = 0
  figs.forEach((fig, i) => { if (was[i].above) grown += fig.getBoundingClientRect().height - was[i].h })
  if (Math.abs(grown) >= 1) window.scrollBy({ top: grown, left: 0, behavior: 'instant' as ScrollBehavior })
  return () => { io?.disconnect(); pending.clear(); cleanups.forEach((c) => c()) }
}
