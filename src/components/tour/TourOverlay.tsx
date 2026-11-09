import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { TOUR_STEPS } from '../../data/tourSteps'
import type { TourKind } from './tourState'
import '../../styles/tour.css'

type Box = { left: number; top: number; width: number; height: number }
type Layout = { spot: Box | null; left: number; top: number }

const SPOT_PAD = 6
const GAP = 14
const EDGE = 12
// Fixed header (44px) plus air: a target above this line is under the bar.
const HEADER_CLEARANCE = 60

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function boxOf(el: Element): Box | null {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || getComputedStyle(el).visibility === 'hidden') return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** The first element of each selector that is really on screen (not collapsed, not hidden), and the box around them all. */
function findTargets(selectors: string[] = []) {
  const els: Element[] = []
  for (const selector of selectors) {
    const el = [...document.querySelectorAll(selector)].find((candidate) => boxOf(candidate))
    if (el) els.push(el)
  }
  const boxes = els.map((el) => boxOf(el) as Box)
  if (boxes.length === 0) return { els, box: null }
  const left = Math.min(...boxes.map((b) => b.left))
  const top = Math.min(...boxes.map((b) => b.top))
  const right = Math.max(...boxes.map((b) => b.left + b.width))
  const bottom = Math.max(...boxes.map((b) => b.top + b.height))
  return { els, box: { left, top, width: right - left, height: bottom - top } }
}

/** Where the card goes: below the target, else above it, else centred; centred on the target but kept on screen. */
function place(box: Box | null, cw: number, ch: number): Layout {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!box) return { spot: null, left: Math.round((vw - cw) / 2), top: Math.round((vh - ch) / 2) }
  const spot = { left: box.left - SPOT_PAD, top: box.top - SPOT_PAD, width: box.width + SPOT_PAD * 2, height: box.height + SPOT_PAD * 2 }
  const below = vh - (spot.top + spot.height) - GAP - EDGE
  const above = spot.top - GAP - EDGE
  let top = (vh - ch) / 2
  if (below >= ch) top = spot.top + spot.height + GAP
  else if (above >= ch) top = spot.top - GAP - ch
  const left = Math.min(Math.max(spot.left + spot.width / 2 - cw / 2, EDGE), Math.max(EDGE, vw - cw - EDGE))
  return { spot, left: Math.round(left), top: Math.round(top) }
}

const sameLayout = (a: Layout | null, b: Layout) =>
  Boolean(a) && a!.left === b.left && a!.top === b.top &&
  (a!.spot === null ? b.spot === null : b.spot !== null && (['left', 'top', 'width', 'height'] as const).every((k) => Math.round(a!.spot![k]) === Math.round(b.spot![k])))

/**
 * The tour itself: a dimmed screen with a spotlight on the step's target and a card beside it.
 * A modal: the page underneath is inert, Tab stays in the card, Esc closes, the arrow keys step.
 * A click on the dim area does nothing but flash the card, so a stray click never ends it; the
 * way out is the explicit 건너뛰기 (or Esc).
 */
export default function TourOverlay({ kind, onClose }: { kind: TourKind; onClose: () => void }) {
  const steps = TOUR_STEPS[kind]
  const [index, setIndex] = useState(0)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [ready, setReady] = useState(false)
  const [nudged, setNudged] = useState(false)
  const titleId = useId()
  const bodyId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const indexRef = useRef(0)
  const scrolledRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const step = steps[index]
  const last = index === steps.length - 1

  useEffect(() => {
    indexRef.current = index
    onCloseRef.current = onClose
  })

  // `targets` is passed by the step-change effect, which runs before indexRef has caught up.
  const measure = useCallback((targets?: string[]) => {
    const card = cardRef.current
    if (!card) return
    const next = place(findTargets(targets ?? steps[indexRef.current].targets).box, card.offsetWidth, card.offsetHeight)
    setLayout((prev) => (sameLayout(prev, next) ? prev : next))
  }, [steps])

  const schedule = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      measure()
    })
  }, [measure])

  // A new step: bring its target into view if it is off screen, then place spotlight and card.
  useLayoutEffect(() => {
    const { els, box } = findTargets(step.targets)
    const el = els[0]
    // Anything in the fixed header is always on screen; scrolling for it would only jolt the page.
    if (el && box && !el.closest('header') && (box.top < HEADER_CLEARANCE || box.top + box.height > window.innerHeight - EDGE)) {
      // Glide when the target is near; a long page jumps (an 8000px glide to the footer drags).
      const near = Math.abs(box.top - window.innerHeight / 2) < window.innerHeight * 2
      el.scrollIntoView({ block: 'center', behavior: near && !prefersReducedMotion() ? 'smooth' : 'auto' })
      scrolledRef.current = true
    }
    measure(step.targets)
  }, [step, measure])

  // Glide between steps only after the first placement, so the opening is not a slide from the corner.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // Keep the spotlight on its target while the page scrolls or resizes.
  useEffect(() => {
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [schedule])

  // Modal for the time it is open: the page is inert, focus goes into the card and comes back.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const startY = window.scrollY
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    cardRef.current?.focus({ preventScroll: true })
    return () => {
      root?.removeAttribute('inert')
      // The tour scrolled to a target (the footer): leave the page where the visitor was.
      if (scrolledRef.current) window.scrollTo({ top: startY, behavior: 'auto' })
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // A step change can leave focus on a button that has just been disabled: keep it in the card.
  useEffect(() => {
    const card = cardRef.current
    if (card && !card.contains(document.activeElement)) card.focus({ preventScroll: true })
  }, [index])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const card = cardRef.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
      } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        const delta = event.key === 'ArrowRight' ? 1 : -1
        const next = indexRef.current + delta
        if (next >= 0 && next < steps.length) setIndex(next)
        else if (next === steps.length) onCloseRef.current()
      } else if (event.key === 'Tab' && card) {
        const focusable = [...card.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (focusable.length === 0) return
        const first = focusable[0]
        const lastEl = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || active === card)) { event.preventDefault(); lastEl.focus() }
        else if (!event.shiftKey && active === lastEl) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [steps.length])

  const nudge = () => {
    setNudged(true)
    window.setTimeout(() => setNudged(false), 420)
  }

  const Icon = step.icon
  const spot = layout?.spot ?? null
  return createPortal(
    <div className="coms-tour" data-site-tour>
      <div className="coms-tour-shield" onPointerDown={nudge} aria-hidden="true" />
      <div
        className={`coms-tour-spot ${ready ? 'is-ready' : ''} ${spot ? '' : 'is-none'}`}
        style={spot ? { left: spot.left, top: spot.top, width: spot.width, height: spot.height } : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 }}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-site-tour
        className={`coms-tour-card ${ready ? 'is-ready' : ''} ${nudged ? 'is-nudged' : ''}`}
        // Placed in a layout effect, before the first paint; until then it sits at 0,0 (and must stay focusable).
        style={{ left: layout?.left ?? 0, top: layout?.top ?? 0 }}
      >
        <div className="coms-tour-progress" aria-hidden="true">
          {steps.map((s, i) => <span key={s.id} className={i <= index ? 'is-on' : ''} />)}
        </div>
        <div className="coms-tour-head">
          <span className="coms-tour-icon" aria-hidden="true"><Icon size={18} /></span>
          <h2 id={titleId} className="coms-tour-title">{step.title}</h2>
          <span className="coms-tour-count">{index + 1} / {steps.length}</span>
        </div>
        <p id={bodyId} className="coms-tour-body">{step.body}</p>
        <div className="coms-tour-actions">
          <button type="button" className="coms-tour-btn coms-tour-btn-ghost" onClick={() => onClose()}>건너뛰기</button>
          <button type="button" className="coms-tour-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <ChevronLeft size={15} aria-hidden="true" />이전
          </button>
          <button type="button" className="coms-tour-btn coms-tour-btn-primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? <>완료<Check size={15} aria-hidden="true" /></> : <>다음<ChevronRight size={15} aria-hidden="true" /></>}
          </button>
        </div>
        <p className="coms-tour-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> 이동 <kbd>Esc</kbd> 닫기</p>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{`${kind === 'guest' ? '둘러보기' : '멤버 안내'} ${index + 1}/${steps.length}단계. ${step.title}. ${step.body}`}</div>
    </div>,
    document.body,
  )
}
