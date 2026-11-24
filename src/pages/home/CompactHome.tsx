import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Megaphone } from 'lucide-react'
import { navGroups } from '../../data/homeContent'
import type { SiteSettings } from '../../services/siteSettingsApi'
import './compact-home.css'

const navItems = navGroups.flatMap((group) => group.items)
const findPath = (id: string) => navItems.find((item) => item.id === id)?.path ?? '/'

const sections: { id: string; title: string; paths: readonly (readonly [string, string])[] }[] = [
  { id: 'about', title: '동아리 소개', paths: [['about', '동아리 소개']] },
  { id: 'activities', title: '활동 · 스터디', paths: [['activities', '활동 보기'], ['study', '스터디 자료'], ['algorithms', '알고리즘 문제']] },
  { id: 'projects', title: '프로젝트 · 작품', paths: [['projects', '프로젝트'], ['apps', '부원 작품']] },
  { id: 'events', title: '해커톤 · 외부 일정', paths: [['hackathon', '해커톤'], ['external-opportunities', '외부 일정']] },
  { id: 'recruit', title: '모집 · 지원', paths: [['recruit', '지원하기'], ['recruit-notice', '모집 공지']] },
  { id: 'contact', title: '협업 문의', paths: [['contact', '문의하기']] },
] as const

type Props = {
  member: boolean
  latestNotice: { id: string | number; title: string } | null
  settings: SiteSettings
  nextActivity: ReactNode
}

export default function CompactHome({ member, latestNotice, settings, nextActivity }: Props) {
  const { hash } = useLocation()
  useEffect(() => {
    if (['#about', '#activities', '#projects', '#recruit'].includes(hash)) {
      document.getElementById(hash.slice(1))?.scrollIntoView()
    }
  }, [hash])

  return (
    <main className={`compact-home theme-home ${member ? 'compact-home--member' : ''}`}>
      <div className="compact-home__inner">
        <header id="opening" className="compact-home__intro">
          <span className="compact-home__eyebrow">광운대학교 중앙 컴퓨터 학술동아리</span>
          <h1>{settings.homeHeroTitle}</h1>
          <p>{settings.homeHeroCopy}</p>
        </header>
        {nextActivity}

        {member && (
          <section className="compact-home__member" aria-label="멤버 바로가기">
            <Link className="compact-home__notice" to={latestNotice ? `/notices/${encodeURIComponent(latestNotice.id)}` : '/notices'}>
              <Megaphone size={19} aria-hidden="true" />
              <span><small>최근 공지</small><strong>{latestNotice?.title || '공지사항 보기'}</strong></span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <div className="compact-home__member-links">
              {['community', 'resources', 'monthly-calendar', 'team-projects', 'activity-events'].map((id) => {
                const item = navItems.find((entry) => entry.id === id)
                return item && <Link key={id} to={item.path}>{item.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>
              })}
            </div>
            <div className="compact-home__tools" aria-label="활동 도구">
              <h2>활동 도구</h2>
              <div>
                {['gatherings', 'meet', 'attendance', 'draw'].map((id) => {
                  const item = navItems.find((entry) => entry.id === id)
                  return item && <Link key={id} to={item.path}>{item.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>
                })}
              </div>
            </div>
          </section>
        )}

        <nav className="compact-home__grid" aria-label="홈 한눈에 보기">
          {sections.map((section) => (
            <section id={section.id} key={section.id} className="compact-home__card">
              <h2>{section.title}</h2>
              <div className="compact-home__links">
                {section.paths.map(([id, label]) => (
                  <Link key={id} to={id === 'recruit-notice' ? '/recruit-notice' : findPath(id)}>{label}<ArrowUpRight size={15} aria-hidden="true" /></Link>
                ))}
              </div>
            </section>
          ))}
        </nav>

      </div>
    </main>
  )
}
