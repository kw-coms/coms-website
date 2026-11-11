import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { INTRO_SESSION_KEY, SCREEN_ON_EVENT, type ScreenOnDetail } from '../../utils/screenOn'
import { getPerfState, subscribePerf } from '../../utils/perfMode'
import { getStoredIntroStyle, type IntroStyle } from '../../utils/themeColors'
import { captureError } from '../../services/observability'

const LegacyIntroCanvas = lazy(() => import('./LegacyIntroCanvas'))
type IntroProps = { introStyle?: IntroStyle; preview?: boolean; onComplete?: () => void }

function IntroFailure({ onComplete }: { onComplete: () => void }) {
  useEffect(onComplete, [onComplete])
  return null
}

class IntroRendererBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { captureError(error, { component: 'legacy-intro' }) }
  render() {
    return this.state.failed ? <IntroFailure onComplete={this.props.onFailure} /> : this.props.children
  }
}

export function IntroPlayback({ home, introStyle, preview, onComplete }: IntroProps & { home: boolean }) {
  return <>
    {home && <ComsIntro key="visit" introStyle={preview ? 'off' : introStyle} />}
    {preview && <ComsIntro key="preview" introStyle={introStyle} preview onComplete={onComplete} />}
  </>
}

function introAlreadyPlayed() {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

// Storage can be unavailable; SPA returns still play only once.
let introPlayed = introAlreadyPlayed()
const REDUCED = '(prefers-reduced-motion: reduce)'
const DURATION = 1600

export default function ComsIntro({ introStyle, preview = false, onComplete }: IntroProps = {}) {
  const [style] = useState(() => introStyle ?? getStoredIntroStyle())
  // Stable across StrictMode's setup, cleanup, setup cycle.
  const [shouldPlay] = useState(() => style !== 'off' && (preview || (!introPlayed && !introAlreadyPlayed())) &&
    getPerfState().mode !== 'lite' && !window.matchMedia(REDUCED).matches)
  const [gone, setGone] = useState(!shouldPlay)
  const skipRef = useRef<() => void>(() => {})
  const completedRef = useRef(false)
  const complete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete?.()
  }, [onComplete])
  const skip = useCallback(() => skipRef.current(), [])

  useLayoutEffect(() => {
    if (!shouldPlay) {
      if (preview) complete()
      return
    }
    if (gone) return
    if (!preview) {
      introPlayed = true
      try {
        sessionStorage.setItem(INTRO_SESSION_KEY, '1')
      } catch {
        // The module flag still gates SPA returns.
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      document.body.style.overflow = previousOverflow
      setGone(true)
      window.dispatchEvent(new CustomEvent<ScreenOnDetail>(SCREEN_ON_EVENT, { detail: { y: window.innerHeight / 2 } }))
      complete()
    }
    skipRef.current = finish
    const reduced = window.matchMedia(REDUCED)
    const sync = () => { if (reduced.matches || getPerfState().mode === 'lite') finish() }
    const offPerf = subscribePerf(sync)
    reduced.addEventListener('change', sync)
    const timer = window.setTimeout(finish, style === 'legacy' ? 6500 : DURATION)
    window.addEventListener('keydown', finish)
    window.addEventListener('wheel', finish, { passive: true })
    window.addEventListener('touchstart', finish, { passive: true })
    sync()
    return () => {
      window.clearTimeout(timer)
      offPerf()
      reduced.removeEventListener('change', sync)
      window.removeEventListener('keydown', finish)
      window.removeEventListener('wheel', finish)
      window.removeEventListener('touchstart', finish)
      document.body.style.overflow = previousOverflow
    }
  }, [shouldPlay, gone, style, preview, complete])

  if (gone) return null
  return (
    <div data-coms-intro="" data-intro-style={style} className="coms-intro" onClick={skip}>
      {style === 'legacy' ? <IntroRendererBoundary onFailure={skip}><Suspense fallback={<p className="coms-intro-loading" aria-hidden="true">COM&apos;S</p>}><LegacyIntroCanvas onDone={skip} /></Suspense></IntroRendererBoundary> : <div className="coms-intro-frame" aria-hidden="true">
        <p className="cine-hud">광운대학교 컴퓨터 학술동아리</p>
        <div className="coms-intro-leader">
          <span className="coms-intro-ring" />
          <p className="coms-intro-title">COM's</p>
        </div>
        <p className="cine-hud">함께 배우고, 바로 만듭니다.</p>
      </div>}
      <button type="button" className="coms-intro-skip" onClick={(event) => { event.stopPropagation(); skipRef.current() }}>skip ›</button>
    </div>
  )
}
