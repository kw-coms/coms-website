// Runtime for the <figure class="circuit" data-circuit="..."> mount points of a study fragment:
// draws the scene, adds the 3D tilt, the simulation, the assembly stepper and the table <-> drawing links.
// Loaded on demand from studyDemos.ts (only when a fragment contains such a figure).
import { circuitById, type CircuitDef } from './definitions'
import { buildScene } from './scene'
import * as sim from './sim'

let counter = 0
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
  const caption = fig.querySelector('figcaption')
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
  const status = h('p', 'circuit-status', IDLE[def.sim], { role: 'status', 'aria-live': 'off' })
  const mounted: HTMLElement[] = [bar, stepper, stage, ctl, status]
  fig.insertBefore(status, caption)
  fig.insertBefore(ctl, status)
  fig.insertBefore(stage, ctl)
  fig.insertBefore(stepper, stage)
  fig.insertBefore(bar, stepper)
  fig.classList.add('is-live')
  fig.setAttribute('data-sim', 'off')
  cleanups.push(() => { mounted.forEach((n) => n.remove()); fig.classList.remove('is-live'); fig.removeAttribute('data-sim'); ;['data-led', 'data-sound'].forEach((a) => fig.removeAttribute(a)) })

  let lastStatus = IDLE[def.sim]
  const setStatus = (s: string) => { if (s !== lastStatus) { lastStatus = s; status.textContent = s } }

  const q = <T extends Element = SVGElement>(sel: string) => svg.querySelector<T>(sel)
  const qa = (sel: string) => Array.from(svg.querySelectorAll<SVGElement>(sel))

  /* ---------- 3D tilt ---------- */
  const view = { flat: reducedMotion(), rx: VIEW_RX, ry: 0 }
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
  btnView.addEventListener('click', () => { view.flat = !view.flat; if (!view.flat) resetView(); else applyView() }, { signal })
  let drag: { x: number; y: number; rx: number; ry: number; id: number } | null = null
  stage.addEventListener('pointerdown', (e) => {
    if (view.flat || (e.target as Element).closest('.hit, button, input')) return
    drag = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry, id: e.pointerId }
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
  const endDrag = () => { drag = null }
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
    clampView()
    applyView()
  }, { signal })
  applyView()

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
      const hint = h('span', 'circuit-hint', '아래 표의 줄에 마우스를 올리거나 포커스하면 그림에서 해당 선과 부품이 강조됩니다.')
      caption.append(hint)
      cleanups.push(() => hint.remove())
    }
    const describedBy = caption ? (caption.id || (caption.id = `${uid}-cap`)) : ''
    rows.forEach((row, i) => {
      row.setAttribute('tabindex', '0')
      if (describedBy) row.setAttribute('aria-describedby', describedBy)
      row.classList.add('circuit-row')
      row.addEventListener('pointerenter', () => hl(i), { signal })
      row.addEventListener('pointerleave', restoreHl, { signal })
      row.addEventListener('focus', () => hl(i), { signal })
      row.addEventListener('blur', restoreHl, { signal })
    })
    def.wires.forEach((_w, wi) => {
      const el = wireEl(wi)
      const si = stepOfWire.get(wi)
      if (!el || si == null) return
      el.addEventListener('pointerenter', () => { clearHl(); el.classList.add('is-hl'); rows[si].classList.add('circuit-row-on') }, { signal })
      el.addEventListener('pointerleave', restoreHl, { signal })
    })
    cleanups.push(() => rows.forEach((row) => {
      row.removeAttribute('tabindex'); row.removeAttribute('aria-describedby')
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
  const lock = (disabled: boolean) => ctl.querySelectorAll('input').forEach((i) => { i.disabled = disabled })

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
      const knob = q('[data-role="knob-pot"]')
      const hit = q('[data-role="knob-hit-pot"]')
      const m = /rotate\(0 ([\d.-]+) ([\d.-]+)\)/.exec(knob?.getAttribute('transform') || '')
      const pivot: [number, number] = m ? [Number(m[1]), Number(m[2])] : [0, 0]
      let raw = 512
      const slider = range('가변저항 값 (analogRead)', 0, 1023, raw, '', (v) => setRaw(v))
      const setRaw = (v: number) => {
        raw = v
        slider.set(v)
        knob?.setAttribute('transform', `rotate(${sim.knobFromRaw(v).toFixed(1)} ${pivot[0]} ${pivot[1]})`)
        const r = sim.potReadout(v)
        setLed('led', running ? r.duty / 255 : 0)
        if (running) setStatus(`analogRead(A0) = ${r.raw} (약 ${r.volts.toFixed(2)}V) → map → analogWrite(9, ${r.duty}) : LED 밝기 ${Math.round((r.duty / 255) * 100)}%`)
      }
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
          setRaw(sim.rawFromKnob(sim.knobFromRaw(raw) + d))
        }, { signal })
        const up = () => { last = null }
        hit.addEventListener('pointerup', up, { signal })
        hit.addEventListener('pointercancel', up, { signal })
      }
      runner = { start: () => setRaw(raw), stop: () => setLed('led', 0) }
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
  const loop = (now: number, t0: number) => {
    runner.frame?.(now - t0, now)
    raf = requestAnimationFrame((n) => loop(n, t0))
  }
  function setRunning(on: boolean) {
    running = on
    btnPlay.textContent = on ? '■ 정지' : '▶ 시뮬레이션'
    btnPlay.setAttribute('aria-pressed', String(on))
    fig.setAttribute('data-sim', on ? 'on' : 'off')
    lock(!on)
    cancelAnimationFrame(raf)
    if (on) {
      runner.start()
      if (runner.frame) raf = requestAnimationFrame((t0) => loop(t0, t0))
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
    cleanups.forEach((c) => c())
  }
}

/** Mounts every circuit figure under `root`; returns a cleanup that removes all of it again. */
export function mountCircuits(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = []
  root.querySelectorAll<HTMLElement>('figure.circuit[data-circuit]').forEach((fig) => {
    const def = circuitById(fig.getAttribute('data-circuit') || '')
    if (def) cleanups.push(mountOne(fig, def))
  })
  return () => cleanups.forEach((c) => c())
}
