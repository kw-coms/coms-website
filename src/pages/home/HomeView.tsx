import type { ReactNode } from 'react'
import { useNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listNotices } from '../../services/noticeApi'
import { getPublicSiteSettings } from '../../services/siteSettingsApi'
import { scrollToTopInstant } from '../../utils/themeColors'
import { isFullPageLink } from '../../utils/fullPageLink'
import { useAuth } from '../../contexts/useAuth'
import { useCineReveal, useSceneProgress } from '../../hooks/useSceneProgress'
import Opening from './scenes/Opening'
import Manifesto from './scenes/Manifesto'
import Activities from './scenes/Activities'
import Projects from './scenes/Projects'
import Members from './scenes/Members'
import Recruit from './scenes/Recruit'
import SceneRail, { type RailItem } from './scenes/SceneRail'
import type { SceneActions } from './scenes/parts'
import { sectionStories } from '../../data/homeContent'

const LATEST_NOTICE_QUERY_KEY = ['app-shell', 'latest-notice']
const SITE_SETTINGS_QUERY_KEY = ['site-settings', 'public']

// The home page is a film in scenes, one subject at a time (see docs/design/specs/
// 2026-11-10-cinematic-redesign.md). A visitor gets the story first; a member gets today's
// club right under the opening. Scene order below follows the reading order of the page.
export default function HomeView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const member = Boolean(user)
  const latestNoticeQuery = useQuery({
    queryKey: LATEST_NOTICE_QUERY_KEY,
    queryFn: listNotices,
    enabled: member,
    select: (data) => {
      const notices = Array.isArray(data) ? data : []
      return notices.find((n) => (n.category || 'GENERAL') === 'GENERAL') ?? null
    },
  })
  const latestNotice = latestNoticeQuery.data ?? null
  const siteSettingsQuery = useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
  })
  const siteSettings = siteSettingsQuery.data

  useSceneProgress()
  useCineReveal(member)

  const openPanel = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const navHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--apple-nav-height')) || 44
    const targetY = Math.max(0, window.scrollY + el.getBoundingClientRect().top - navHeight - 10)
    window.scrollTo({ top: targetY, behavior: 'smooth' })
  }

  const goPageTop = (to: To, options?: NavigateOptions) => {
    if (isFullPageLink(to)) {
      window.location.assign(to)
      return
    }
    scrollToTopInstant()
    navigate(to, options)
  }
  const locationPath = () => `${location.pathname}${location.search}${location.hash}`

  const actions: Record<'about' | 'activities' | 'projects' | 'recruit', SceneActions> = {
    about: {
      primary: { label: sectionStories.about.primary, onClick: () => goPageTop('/about') },
      secondary: { label: sectionStories.about.secondary, onClick: () => openPanel('activities') },
    },
    activities: {
      primary: { label: sectionStories.activities.primary, onClick: () => goPageTop('/activities') },
      secondary: { label: sectionStories.activities.secondary, onClick: () => goPageTop('/projects') },
    },
    projects: {
      primary: { label: sectionStories.projects.primary, onClick: () => goPageTop('/projects') },
      secondary: { label: sectionStories.projects.secondary, href: 'https://github.com/kw-coms' },
    },
    recruit: {
      primary: { label: sectionStories.recruit.primary, onClick: () => goPageTop('/recruit') },
      secondary: {
        label: sectionStories.recruit.secondary,
        onClick: () => goPageTop('/recruit-notice', { state: { from: `${locationPath()}#recruit` } }),
      },
    },
  }

  // The scenes in page order. A member's "today" scene comes straight after the opening.
  type SceneKey = 'opening' | 'members' | 'about' | 'activities' | 'projects' | 'recruit'
  const order: SceneKey[] = member
    ? ['opening', 'members', 'about', 'activities', 'projects', 'recruit']
    : ['opening', 'about', 'activities', 'projects', 'members', 'recruit']
  const names: Record<SceneKey, string> = {
    opening: '시작',
    members: member ? '오늘' : '멤버',
    about: '소개',
    activities: '활동',
    projects: '프로젝트',
    recruit: '모집',
  }
  const railItems: RailItem[] = order.map((key) => ({ id: key, label: names[key] }))
  const number = (key: SceneKey) => order.indexOf(key) + 1

  const scenes: Record<SceneKey, ReactNode> = {
    opening: (
      <Opening
        key="opening"
        title={siteSettings?.homeHeroTitle || "COM's"}
        copy={siteSettings?.homeHeroCopy || '배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.'}
        semester={siteSettings?.semesterLabel || '2026 Semester Ready'}
        total={order.length}
        noticeTitle={member ? latestNotice?.title ?? null : null}
        onMore={() => openPanel('about')}
        onApply={() => goPageTop('/recruit')}
        onNotice={() => goPageTop('/notices')}
      />
    ),
    members: <Members key="members" index={number('members')} member={member} noticeTitle={latestNotice?.title ?? null} onGo={(path) => goPageTop(path)} />,
    about: <Manifesto key="about" index={number('about')} actions={actions.about} />,
    activities: <Activities key="activities" index={number('activities')} actions={actions.activities} onOpen={openPanel} />,
    projects: <Projects key="projects" index={number('projects')} actions={actions.projects} onOpen={() => goPageTop('/projects')} />,
    recruit: <Recruit key="recruit" index={number('recruit')} actions={actions.recruit} />,
  }

  return (
    <div className="theme-home cine-root scenes relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <div className="cine-grain" aria-hidden="true" />
      <main className="apple-home-main scenes-main relative overflow-x-clip">{order.map((key) => scenes[key])}</main>
      <SceneRail items={railItems} />
    </div>
  )
}
