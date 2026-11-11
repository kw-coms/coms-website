import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { MOBILE_TOUR_STEPS, TOUR_STEPS, type TourStep } from '../../data/tourSteps'
import { setTourSurface, type TourKind } from './tourState'
import { placeTourCard, type Box, type Layout, type Viewport } from './tourLayout'
import '../../styles/tour.css'

const EDGE = 12
// Fixed header (44px) plus air: a target above this line is under the bar.
const HEADER_CLEARANCE = 60

function boxOf(el: Element, clipped = true): Box | null {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  let { left, top, right, bottom } = rect
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null
    if (!clipped || node === el) continue
    const bounds = node.getBoundingClientRect()
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      left = Math.max(left, bounds.left)
      right = Math.min(right, bounds.right)
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      top = Math.max(top, bounds.top)
      bottom = Math.min(bottom, bounds.bottom)
    }
  }
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}

/** The first element of each selector that is really on screen (not collapsed, not hidden), and the box around them all. */
function findTargets(selectors: string[] = []) {
  const els: Element[] = []
  for (const selector of selectors) {
    const el = [...document.querySelectorAll(selector)].find((candidate) => boxOf(candidate, false))
    if (el) els.push(el)
  }
  const boxes = els.map((el) => boxOf(el)).filter((box): box is Box => box !== null)
  if (boxes.length === 0) return { els, box: null }
  const left = Math.min(...boxes.map((b) => b.left))
  const top = Math.min(...boxes.map((b) => b.top))
  const right = Math.max(...boxes.map((b) => b.left + b.width))
  const bottom = Math.max(...boxes.map((b) => b.top + b.height))
  return { els, box: { left, top, width: right - left, height: bottom - top } }
}

const visibleViewport = (): Viewport => ({
  left: window.visualViewport?.offsetLeft ?? 0,
  top: window.visualViewport?.offsetTop ?? 0,
  width: window.visualViewport?.width ?? window.innerWidth,
  height: window.visualViewport?.height ?? window.innerHeight,
})

const sameLayout = (a: Layout | null, b: Layout) =>
  Boolean(a) && a!.left === b.left && a!.top === b.top &&
  a!.maxWidth === b.maxWidth && a!.maxHeight === b.maxHeight &&
  (a!.spot === null ? b.spot === null : b.spot !== null && (['left', 'top', 'width', 'height'] as const).every((k) => Math.round(a!.spot![k]) === Math.round(b.spot![k])))

/**
 * The tour itself: a dimmed screen with a spotlight on the step's target and a card beside it.
 * A modal: the page underneath is inert, Tab stays in the card, Esc closes, the arrow keys step.
 * A click on the dim area does nothing but flash the card, so a stray click never ends it; the
 * way out is the explicit 건너뛰기 (or Esc).
 */
export default function TourOverlay({ kind, onClose, onShown }: { kind: TourKind; onClose: () => void; onShown?: () => void }) {
  // Keep one profile for this tour; a resize moves the card without changing the step list.
  const [mobile] = useState(() => window.matchMedia?.('(max-width: 1023px)').matches ?? false)
  const steps = mobile ? MOBILE_TOUR_STEPS[kind] : TOUR_STEPS[kind]
  const [index, setIndex] = useState(0)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [ready, setReady] = useState(false)
  const [preparedStep, setPreparedStep] = useState<TourStep | null>(null)
  const [nudged, setNudged] = useState(false)
  const titleId = useId()
  const bodyId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef(0)
  const indexRef = useRef(0)
  const scrolledRef = useRef(false)
  const startYRef = useRef(0)
  const nudgeTimerRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const onShownRef = useRef(onShown)
  const shownRef = useRef(false)
  const step = steps[index]
  const prepared = preparedStep === step
  const last = index === steps.length - 1

  useEffect(() => {
    indexRef.current = index
    onCloseRef.current = onClose
    onShownRef.current = onShown
  })

  useEffect(() => {
    if (!prepared || shownRef.current) return
    shownRef.current = true
    onShownRef.current?.()
  }, [prepared])

  useEffect(() => () => setTourSurface(null), [])

  // Skip, 완료 and Esc: the tour scrolled to a target (the footer), so leave the page where the
  // visitor was. Not done in the unmount cleanup: after a navigation that would scroll the new page.
  const close = useCallback(() => {
    if (scrolledRef.current) window.scrollTo({ top: startYRef.current, behavior: 'auto' })
    onCloseRef.current()
  }, [])

  // `targets` is passed by the step-change effect, which runs before indexRef has caught up.
  const measure = useCallback((selected?: TourStep) => {
    const card = cardRef.current
    if (!card) return
    const current = selected ?? steps[indexRef.current]
    const next = placeTourCard(findTargets(current.targets).box, card.offsetWidth,
        Math.max(card.offsetHeight, card.scrollHeight), visibleViewport(), true)
    setLayout((prev) => (sameLayout(prev, next) ? prev : next))
  }, [steps])

  const schedule = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      measure()
    })
  }, [measure])

  // Open real UI first; React commits it before the two frames that scroll and measure it.
  useLayoutEffect(() => {
    let disposed = false
    let revealFrame = 0
    let measureFrame = 0
    const prepare = () => {
      if (disposed || revealFrame || measureFrame) return
      setPreparedStep(null)
      revealFrame = window.requestAnimationFrame(() => {
        revealFrame = 0
        if (disposed) return
        const { els } = findTargets(step.targets)
        const view = visibleViewport()
        for (const el of els) {
          const box = el.getBoundingClientRect()
          // Header triggers are fixed, but rows inside the menu have their own scrollport.
          if (el.closest('#mobile-menu, #nav-panel') || !el.closest('header') &&
            (box.top < Math.max(HEADER_CLEARANCE, view.top + EDGE) || box.bottom > view.top + view.height - EDGE)) {
            el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
            scrolledRef.current = true
          }
        }
        measureFrame = window.requestAnimationFrame(() => {
          measureFrame = 0
          if (disposed) return
          measure(step)
          setPreparedStep(step)
        })
      })
    }
    const reconcile = () => {
      setTourSurface(step.surface ?? null)
      prepare()
    }
    const mutation = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element && record.target.closest('.coms-tour')))) prepare()
    })
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
    window.addEventListener('resize', reconcile)
    reconcile()
    return () => {
      disposed = true
      mutation.disconnect()
      window.removeEventListener('resize', reconcile)
      window.cancelAnimationFrame(revealFrame)
      window.cancelAnimationFrame(measureFrame)
    }
  }, [step, measure])

  // Glide between steps only after the first placement, so the opening is not a slide from the corner.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // Keep the spotlight on its target while the page scrolls or resizes.
  useEffect(() => {
    const viewport = window.visualViewport
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (cardRef.current) observer?.observe(cardRef.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, { capture: true })
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [schedule])

  // Modal for the time it is open: the page is inert, focus goes into the card and comes back.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    startYRef.current = window.scrollY
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    return () => {
      root?.removeAttribute('inert')
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // A step change can leave focus on a button that has just been disabled (이전 on step 1). The browser
  // blurs it at its own time, before or after this effect, so check both cases and move to 다음/완료.
  useEffect(() => {
    const card = cardRef.current
    const active = document.activeElement
    if (prepared && card && (!card.contains(active) || active?.matches(':disabled'))) {
      if (index === 0) card.focus({ preventScroll: true })
      else (primaryRef.current ?? card).focus({ preventScroll: true })
    }
  }, [index, prepared])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const card = cardRef.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        const delta = event.key === 'ArrowRight' ? 1 : -1
        const next = indexRef.current + delta
        if (next >= 0 && next < steps.length) setIndex(next)
        else if (next === steps.length) close()
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
  }, [steps.length, close])

  const nudge = () => {
    setNudged(true)
    window.clearTimeout(nudgeTimerRef.current)
    nudgeTimerRef.current = window.setTimeout(() => setNudged(false), 420)
  }
  useEffect(() => () => window.clearTimeout(nudgeTimerRef.current), [])

  const Icon = step.icon
  const spot = layout?.spot ?? null
  return createPortal(
      <div className="coms-tour" data-site-tour data-tour-profile={mobile ? 'mobile' : 'desktop'} data-tour-step={step.id} data-tour-ready={prepared}>
      <div className="coms-tour-shield" onPointerDown={nudge} aria-hidden="true" />
      <div
        className={`coms-tour-spot ${ready ? 'is-ready' : ''} ${spot ? '' : 'is-none'}`}
        style={spot ? { left: spot.left, top: spot.top, width: spot.width, height: spot.height } : { left: visibleViewport().left + visibleViewport().width / 2, top: visibleViewport().top + visibleViewport().height / 2, width: 0, height: 0 }}
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
        style={{ left: layout?.left ?? 0, top: layout?.top ?? 0,
          maxWidth: layout?.maxWidth, maxHeight: layout?.maxHeight }}
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
          <button type="button" className="coms-tour-btn coms-tour-btn-ghost" onClick={close}>건너뛰기</button>
          <button type="button" className="coms-tour-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <ChevronLeft size={15} aria-hidden="true" />이전
          </button>
          <button ref={primaryRef} type="button" className="coms-tour-btn coms-tour-btn-primary" onClick={() => (last ? close() : setIndex(index + 1))}>
            {last ? <>완료<Check size={15} aria-hidden="true" /></> : <>다음<ChevronRight size={15} aria-hidden="true" /></>}
          </button>
        </div>
        <p className="coms-tour-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> 이동 <kbd>Esc</kbd> 닫기</p>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{`${index + 1} / ${steps.length} · ${step.title}`}</div>
    </div>,
    document.body,
  )
}
