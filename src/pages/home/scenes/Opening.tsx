import { useEffect, useRef } from 'react'
import { Megaphone } from 'lucide-react'
import { ghostActionBtnClass, solidActionBtnClass } from '../../../shared/homeUi'
import { SCREEN_ON_EVENT } from '../../../utils/screenOn'
import HeroField from '../HeroField'
import { cssVars } from './parts'

type Props = {
  title: string
  copy: string
  semester: string
  total: number
  noticeTitle: string | null
  onMore: () => void
  onApply: () => void
  onNotice: () => void
}

// Scene 1. The wordmark is the picture. Its letters rise once on load (after the boot intro, if
// one is covering the page), and as the page scrolls away the wordmark sinks back and two
// letterbox bars close (both read --hero-out from useSceneProgress).
export default function Opening({ title, copy, semester, total, noticeTitle, onMore, onApply, onNotice }: Props) {
  const wordmarkRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    const mark = wordmarkRef.current
    if (!mark) return
    let timer = 0
    const show = () => mark.classList.add('is-revealed')
    // While the intro covers the page the letters wait for it to open; never wait for long.
    if (document.querySelector('[data-coms-intro]')) {
      window.addEventListener(SCREEN_ON_EVENT, show, { once: true })
      timer = window.setTimeout(show, 4500)
    } else {
      timer = window.setTimeout(show, 60)
    }
    return () => {
      window.removeEventListener(SCREEN_ON_EVENT, show)
      window.clearTimeout(timer)
    }
  }, [])

  const letters = Array.from(title)
  // Longer titles (a site setting) shrink so the word still fits the screen.
  const fit = Math.min(1, 6 / Math.max(1, letters.length))

  return (
    <section id="opening" data-scene="opening" className="scene scene-opening" aria-label="COM's">
      <div className="scene-opening__bg" aria-hidden="true">
        <HeroField />
        <div className="scene-opening__vignette" />
      </div>
      <span className="scene-opening__bar scene-opening__bar--top" aria-hidden="true" />
      <span className="scene-opening__bar scene-opening__bar--bottom" aria-hidden="true" />

      <p className="cine-hud scene-opening__tl">KW COM's<span className="scene-opening__tl-more"> · Kwangwoon Univ.</span></p>
      <p className="cine-hud scene-opening__tr">Scene 01 / {String(total).padStart(2, '0')}</p>

      <div className="scene-opening__stage">
        <h1
          ref={wordmarkRef}
          data-cine-hold
          aria-label={title}
          className="cine-lines scene-wordmark"
          style={cssVars({ '--fit': fit })}
        >
          {letters.map((ch, i) => (
            <span key={i} className="cine-m" aria-hidden="true" style={cssVars({ '--i': i * 0.6 })}>
              <span>{ch}</span>
            </span>
          ))}
        </h1>
      </div>

      <div className="scene-opening__copy">
        <p className="scene-opening__lede">{copy}</p>
        <div className="scene-actions">
          <button type="button" onClick={onMore} className={solidActionBtnClass}>더 알아보기</button>
          <button type="button" onClick={onApply} className={ghostActionBtnClass}>지원하기</button>
        </div>
        {noticeTitle && (
          <button type="button" onClick={onNotice} className="scene-notice">
            <Megaphone size={14} aria-hidden="true" />
            <span className="scene-notice__title">{noticeTitle}</span>
            <span className="scene-notice__tag">공지</span>
          </button>
        )}
      </div>

      <p className="cine-hud scene-opening__bl">{semester}</p>
      <p className="cine-hud scene-opening__br" aria-hidden="true">Scroll<i /></p>
    </section>
  )
}
