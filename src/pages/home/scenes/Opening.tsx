import { useEffect, useRef, type ReactNode } from 'react'
import { AppWindow, ArrowRight, BookOpen, DraftingCompass, FileText, FolderOpen, Megaphone, Terminal } from 'lucide-react'
import { experiencePills } from '../../../data/homeContent'
import { SCREEN_ON_EVENT } from '../../../utils/screenOn'
import HeroField from '../HeroField'
import { cssVars } from './cssVars'

const TICKER = Array.from({ length: 2 }, () => experiencePills.join('   ·   ') + '   ·   ').join('')

type Props = {
  title: string
  copy: string | null
  semester: string | null
  noticeTitle: string
  nextActivity: ReactNode
  onMore: () => void
  onApply: () => void
  onNotice: () => void
}

export default function Opening({ title, copy, semester, noticeTitle, nextActivity, onMore, onApply, onNotice }: Props) {
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

  const letters = Array.from(title)
  const fit = Math.min(1, 6 / Math.max(1, letters.length))

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
        <div className="scene-opening__cube">
          <div className="scene-opening__cube-rig">
            <div className="scene-opening__cube-wire"><i /><i /><i /><i /><i /><i /></div>
            <div className="scene-opening__cube-wire scene-opening__cube-wire--inner"><i /><i /><i /><i /><i /><i /></div>
          </div>
        </div>
        <div className="scene-opening__vignette" />
      </div>
      <span className="scene-opening__bar scene-opening__bar--top" aria-hidden="true" />
      <span className="scene-opening__bar scene-opening__bar--bottom" aria-hidden="true" />

      <div className="scene-opening__layout">
        <div className="home-mode-bar" aria-hidden="true">
          <span className="home-mode-bar__terminal" aria-hidden="true"><Terminal size={16} /> coms@kw:~</span>
          <span className="home-mode-bar__retro" aria-hidden="true"><AppWindow size={17} /> COM's 홈</span>
          <span className="home-mode-bar__blueprint" aria-hidden="true"><DraftingCompass size={17} /> COM's 구조도</span>
        </div>
        <div className="scene-opening__copy">
          {semester && <p className="cine-hud scene-opening__semester">{semester}</p>}
          <h1 ref={wordmarkRef} data-cine-hold aria-label={title} className="cine-lines scene-wordmark"
            style={cssVars({ '--fit': fit, '--len': letters.length })}>
            {letters.map((letter, index) => (
              <span key={index} className="cine-m" aria-hidden="true" style={cssVars({ '--i': index * 0.6, '--k': index })}>
                <span>{letter === ' ' ? '\u00a0' : letter}</span>
              </span>
            ))}
          </h1>
          <p className="scene-opening__lede">
            {copy ?? <>광운대학교 중앙 컴퓨터 학술동아리<br />같이 배우고, 직접 만듭니다.</>}
          </p>
          <button type="button" onClick={onNotice} className="scene-notice">
            <Megaphone size={15} aria-hidden="true" />
            <span className="scene-notice__tag">공지</span>
            <span className="scene-notice__title">{noticeTitle}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          {nextActivity}
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
          <ul className="scene-opening__activities" aria-label="주요 활동">
            <li>정기 세미나</li>
            <li>팀 프로젝트</li>
            <li>부원 교류</li>
          </ul>
        </div>
        <div className="scene-opening__art" aria-hidden="true">
          <div className="home-mode-terminal-output">
            <span className="home-mode-terminal-output__prompt" aria-hidden="true">$ ls activities</span>
            <span aria-hidden="true">세미나</span><span aria-hidden="true">스터디</span><span aria-hidden="true">팀 프로젝트</span>
          </div>
          <div className="home-mode-retro-directory">
            <span aria-hidden="true">동아리 폴더</span>
            <span aria-hidden="true"><FolderOpen size={17} /> 정기 세미나</span>
            <span aria-hidden="true"><FolderOpen size={17} /> 팀 프로젝트</span>
            <span aria-hidden="true"><FolderOpen size={17} /> 부원 교류</span>
          </div>
          <div className="home-mode-blueprint-drawing"><DraftingCompass size={112} strokeWidth={0.8} /></div>
          <span className="home-mode-blueprint-note" aria-hidden="true">COM's 설계 도면</span>
        </div>
      </div>

      <div className="scene-opening__ticker" data-ticker aria-hidden="true">
        <span className="scene-opening__ticker-run" data-t={TICKER} />
      </div>
    </section>
  )
}
