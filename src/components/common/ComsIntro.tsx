import { useEffect, useRef, useState } from 'react'
import { INTRO_SESSION_KEY, SCREEN_ON_EVENT, type ScreenOnDetail } from '../../utils/screenOn'
import { getPerfState, subscribePerf } from '../../utils/perfMode'

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

export default function ComsIntro() {
  // Stable across StrictMode's setup, cleanup, setup cycle.
  const [shouldPlay] = useState(() => !introPlayed && !introAlreadyPlayed() &&
    getPerfState().mode !== 'lite' && !window.matchMedia(REDUCED).matches)
  const [gone, setGone] = useState(!shouldPlay)
  const skipRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!shouldPlay || gone) return
    introPlayed = true
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, '1')
    } catch {
      // The module flag still gates SPA returns.
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
    }
    skipRef.current = finish
    const reduced = window.matchMedia(REDUCED)
    const sync = () => { if (reduced.matches || getPerfState().mode === 'lite') finish() }
    const offPerf = subscribePerf(sync)
    reduced.addEventListener('change', sync)
    const timer = window.setTimeout(finish, DURATION)
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
  }, [shouldPlay, gone])

  if (gone) return null
  return (
    <div data-coms-intro="" className="coms-intro" onClick={() => skipRef.current()}>
      <div className="coms-intro-frame" aria-hidden="true">
        <p className="cine-hud">광운대학교 컴퓨터 학술동아리</p>
        <div className="coms-intro-leader">
          <span className="coms-intro-ring" />
          <p className="coms-intro-title">COM's</p>
        </div>
        <p className="cine-hud">함께 배우고, 바로 만듭니다.</p>
      </div>
      <button type="button" className="coms-intro-skip" onClick={(event) => { event.stopPropagation(); skipRef.current() }}>skip ›</button>
    </div>
  )
}
