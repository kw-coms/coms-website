import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { listNotices } from '../../services/noticeApi'
import { listClubActivityTimeline } from '../../services/clubActivityApi'
import { nextActivity } from '../../data/nextActivity'
import { defaultSiteSettings, getPublicSiteSettings } from '../../services/siteSettingsApi'
import { scrollToTopInstant } from '../../utils/themeColors'
import { isFullPageLink } from '../../utils/fullPageLink'
import { useAuth } from '../../contexts/useAuth'
import { useCalm } from '../../hooks/useCalm'
import { useCineReveal, usePointerFx, useSceneProgress } from '../../hooks/useSceneProgress'
import Opening from './scenes/Opening'
import Manifesto from './scenes/Manifesto'
import Activities from './scenes/Activities'
import Projects from './scenes/Projects'
import Members from './scenes/Members'
import Recruit from './scenes/Recruit'
import Backdrop from './scenes/Backdrop'
import Divider from './scenes/Divider'
import SceneRail, { type RailItem } from './scenes/SceneRail'
import type { SceneActions } from './scenes/parts'
import { sectionStories } from '../../data/homeContent'
import { useHomeLayout } from '../../utils/homeLayout'
import CompactHome from './CompactHome'

const LATEST_NOTICE_QUERY_KEY = ['app-shell', 'latest-notice']
const SITE_SETTINGS_QUERY_KEY = ['site-settings', 'public']
const ACTIVITY_TIMELINE_QUERY_KEY = ['home', 'activity-timeline']
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function SceneEffects({ member }: { member: boolean }) {
  useSceneProgress()
  usePointerFx()
  useCineReveal(member)
  return null
}

// The home page is a film in scenes, one subject at a time (see docs/design/specs/
// 2026-11-10-cinematic-redesign.md). A visitor gets the story first; a member gets today's
// club right under the opening. Scene order below follows the reading order of the page.
export default function HomeView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const calm = useCalm()
  const homeLayout = useHomeLayout()
  const member = Boolean(user)
  const queryClient = useQueryClient()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let timeoutId: number
    const scheduleMidnight = () => {
      const current = Date.now()
      const nextMidnight = Math.floor((current + KST_OFFSET_MS) / DAY_MS + 1) * DAY_MS - KST_OFFSET_MS
      timeoutId = window.setTimeout(() => {
        setNow(Date.now())
        void queryClient.invalidateQueries({ queryKey: ACTIVITY_TIMELINE_QUERY_KEY })
        scheduleMidnight()
      }, nextMidnight - current)
    }
    scheduleMidnight()
    return () => window.clearTimeout(timeoutId)
  }, [queryClient])
  const latestNoticeQuery = useQuery({
    queryKey: LATEST_NOTICE_QUERY_KEY,
    queryFn: listNotices,
    enabled: member,
    select: (data) => {
      const notices = Array.isArray(data) ? data : []
      return notices.find((n) => (n.category || 'GENERAL') === 'GENERAL') ?? null
    },
  })
  const latestNotice = member ? latestNoticeQuery.data ?? null : null
  const siteSettingsQuery = useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
  })
  const siteSettings = siteSettingsQuery.data ?? defaultSiteSettings
  const activityQuery = useQuery({
    queryKey: ACTIVITY_TIMELINE_QUERY_KEY,
    queryFn: async () => {
      const items = await listClubActivityTimeline()
      return Array.isArray(items) ? items : []
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const activity = activityQuery.isSuccess ? nextActivity(activityQuery.data, now) ?? null : null
  const nextActivityStrip = activity && (
    <div className="home-next-activity">
      <Link to="/activities#act-upcoming" className="scene-notice">
        <CalendarDays size={15} aria-hidden="true" />
        <span className="scene-notice__tag">다음 일정</span>
        <span className="scene-notice__title">{activity.title}</span>
        <span className="scene-notice__tag">{activity.live ? '진행 중' : activity.days === 0 ? '오늘' : `D-${activity.days}`}</span>
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )

  const openPanel = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const navHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--apple-nav-height')) || 44
    const targetY = Math.max(0, window.scrollY + el.getBoundingClientRect().top - navHeight - 10)
    window.scrollTo({ top: targetY, behavior: calm ? 'instant' : 'smooth' })
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
  const openNotice = () => {
    if (!member) {
      goPageTop('/recruit-notice', { state: { from: locationPath() } })
      return
    }
    goPageTop(latestNotice?.id != null ? `/notices/${encodeURIComponent(latestNotice.id)}` : '/notices')
  }

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
      secondary: { label: '부원 작품 보기', onClick: () => goPageTop('/apps') },
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
    opening: '홈',
    members: member ? '오늘의 COM’s' : '멤버 혜택',
    about: '동아리 소개',
    activities: '동아리 활동',
    projects: '프로젝트',
    recruit: '모집',
  }
  const railItems: RailItem[] = order.map((key) => ({ id: key, label: names[key] }))
  const number = (key: SceneKey) => order.indexOf(key) + 1
  const backdrop = (key: Exclude<SceneKey, 'opening'>) => {
    const at = order.indexOf(key)
    return <Backdrop numeral={at + 1} variant={key} prev={order[at - 1]} next={order[at + 1]} />
  }
  const dividerNames: Record<SceneKey, string> = { opening: 'COM\'s', members: member ? 'Today' : 'Members', about: 'About', activities: 'Activities', projects: 'Projects', recruit: 'Recruit' }

  const scenes: Record<SceneKey, ReactNode> = {
    opening: (
      <Opening
        key="opening"
        title={siteSettings.homeHeroTitle}
        copy={siteSettings.homeHeroCopy === defaultSiteSettings.homeHeroCopy ? null : siteSettings.homeHeroCopy}
        semester={siteSettings.semesterLabel === defaultSiteSettings.semesterLabel ? null : siteSettings.semesterLabel}
        noticeTitle={member ? latestNotice?.title || '동아리 공지사항 보기' : '모집 일정 및 지원 안내'}
        nextActivity={nextActivityStrip}
        onMore={() => openPanel('about')}
        onApply={() => goPageTop('/recruit')}
        onNotice={openNotice}
      />
    ),
    members: <Members key="members" index={number('members')} member={member} noticeTitle={latestNotice?.title ?? null} onGo={(path) => goPageTop(path)} backdrop={backdrop('members')} />,
    about: <Manifesto key="about" index={number('about')} actions={actions.about} backdrop={backdrop('about')} />,
    activities: <Activities key="activities" index={number('activities')} actions={actions.activities} onOpen={openPanel} backdrop={backdrop('activities')} />,
    projects: <Projects key="projects" index={number('projects')} actions={actions.projects} backdrop={backdrop('projects')} />,
    recruit: <Recruit key="recruit" index={number('recruit')} actions={actions.recruit} backdrop={backdrop('recruit')} />,
  }

  if (homeLayout === 'compact') return (
    <CompactHome member={member} latestNotice={latestNotice} settings={siteSettings} nextActivity={nextActivityStrip} />
  )

  return (
    <div className="theme-home cine-root scenes relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <SceneEffects member={member} />
      <div className="cine-grain" aria-hidden="true" />
      <SceneRail items={railItems} calm={calm} />
      <main className="apple-home-main scenes-main relative overflow-x-clip">{order.map((key, i) => (
          <Fragment key={key}>
            {i > 0 && <Divider name={dividerNames[key]} dir={i % 2 ? 1 : -1} />}
            {scenes[key]}
          </Fragment>
        ))}
      </main>
    </div>
  )
}
