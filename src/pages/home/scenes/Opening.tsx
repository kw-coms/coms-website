import { useEffect, useRef } from 'react'
import { AppWindow, ArrowRight, BookOpen, DraftingCompass, FileText, Megaphone, Terminal } from 'lucide-react'
import { experiencePills } from '../../../data/homeContent'
import { SCREEN_ON_EVENT } from '../../../utils/screenOn'
import HeroField from '../HeroField'
import { cssVars } from './cssVars'
import TypedLine from './TypedLine'

const TICKER = Array.from({ length: 2 }, () => experiencePills.join('   ·   ') + '   ·   ').join('')

type Props = {
  title: string
  copy: string
  semester: string
  noticeTitle: string | null
  onMore: () => void
  onApply: () => void
  onNotice: () => void
}

export default function Opening({ title, copy, semester, noticeTitle, onMore, onApply, onNotice }: Props) {
  const wordmarkRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    const mark = wordmarkRef.current
    if (!mark) return
    let timer = 0
    const show = () => mark.classList.add('is-revealed')
    // Wait for the boot intro to clear before revealing the title.
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

  const fit = Math.max(0.48, Math.min(1, 7 / Array.from(title).length))

  return (
    <section id="opening" data-scene="opening" className="scene scene-opening" aria-label="COM's">
      <div className="scene-opening__bg" aria-hidden="true">
        <div className="scene-opening__aurora">
          <span className="aurora aurora--a" />
          <span className="aurora aurora--b" />
          <span className="aurora aurora--c" />
        </div>
        <div className="scene-opening__floor">
          <div className="floor__plane"><i /></div>
        </div>
        <HeroField />
        <div className="scene-opening__vignette" />
      </div>

      <div className="scene-opening__layout">
        <div className="home-mode-bar" aria-hidden="true">
          <span className="home-mode-bar__terminal" aria-hidden="true"><Terminal size={16} /> coms@kw:~</span>
          <span className="home-mode-bar__retro" aria-hidden="true"><AppWindow size={17} /> COM's 홈</span>
          <span className="home-mode-bar__blueprint" aria-hidden="true"><DraftingCompass size={17} /> COM's 구조도</span>
        </div>
        <div className="scene-opening__copy">
          <p className="cine-hud scene-opening__semester">{semester}</p>
          <h1 ref={wordmarkRef} data-cine-hold className="cine-lines scene-wordmark" style={cssVars({ '--fit': fit })}>
            <span className="cine-m"><span>{title}</span></span>
          </h1>
          <p className="scene-opening__lede">{copy}</p>
          <div className="scene-actions">
            <button type="button" onClick={onMore} className="apple-action-primary scene-btn">
              <span className="home-mode-prompt" aria-hidden="true">$</span>
              <BookOpen className="home-mode-action-icon" size={21} aria-hidden="true" />
              동아리 소개 <ArrowRight className="home-mode-action-arrow" size={17} aria-hidden="true" />
            </button>
            <button type="button" onClick={onApply} className="apple-action-secondary scene-btn">
              <span className="home-mode-prompt" aria-hidden="true">$</span>
              <FileText className="home-mode-action-icon" size={21} aria-hidden="true" />
              지원하기
            </button>
          </div>
          {noticeTitle && (
            <button type="button" onClick={onNotice} className="scene-notice">
              <Megaphone size={15} aria-hidden="true" />
              <span className="scene-notice__title">{noticeTitle}</span>
              <span className="scene-notice__tag">공지</span>
            </button>
          )}
          <TypedLine />
        </div>
        <div className="scene-opening__art" aria-hidden="true">
          <div className="home-mode-terminal-output">
            <span className="home-mode-terminal-output__prompt" aria-hidden="true">$ ls activities</span>
            <span aria-hidden="true">세미나</span><span aria-hidden="true">스터디</span><span aria-hidden="true">팀 프로젝트</span>
          </div>
          <div className="scene-opening__traces"><i /><i /><i /><i /></div>
          <div className="scene-processor">
            <span className="scene-processor__plate scene-processor__plate--base" />
            <span className="scene-processor__plate scene-processor__plate--middle" />
            <span className="scene-processor__plate scene-processor__plate--top" />
            <span className="scene-processor__mark" />
          </div>
          <span className="home-mode-blueprint-note" aria-hidden="true">동아리 로고</span>
        </div>
      </div>

      <div className="scene-opening__ticker" data-ticker aria-hidden="true">
        <span className="scene-opening__ticker-run" data-t={TICKER} />
      </div>
    </section>
  )
}
