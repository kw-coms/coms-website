import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Megaphone, Users, type LucideIcon } from 'lucide-react'
import { navGroups } from '../../data/homeContent'
import type { SiteSettings } from '../../services/siteSettingsApi'
import './compact-home.css'

const navItems = navGroups.flatMap((group) => group.items)
const navItem = (id: string) => navItems.find((item) => item.id === id)

type Row = { id: string; label: string; note: string; path?: string; icon?: LucideIcon }

// The directory: three groups a visitor actually looks for, each row saying what is behind it.
const groups: { id: string; title: string; rows: Row[] }[] = [
  {
    id: 'about',
    title: '동아리',
    rows: [
      { id: 'about', label: '동아리 소개', note: '어떤 동아리이고 무엇을 하는지' },
      { id: 'activities', label: '활동 보기', note: '올해 한 일과 다가오는 일정' },
      { id: 'contact', label: '문의하기', note: '공동 행사·연합 활동 제안' },
    ],
  },
  {
    id: 'activities',
    title: '배우기',
    rows: [
      { id: 'study', label: '스터디 자료', note: '웹 · C · Java · Python · 아두이노 기초' },
      { id: 'study-groups', label: '스터디 모임', note: '함께할 스터디를 찾거나 제안하기', path: '/study/groups', icon: Users },
      { id: 'algorithms', label: '알고리즘 문제', note: '오늘의 문제와 친구 대결' },
    ],
  },
  {
    id: 'projects',
    title: '만들고 겨루기',
    rows: [
      { id: 'projects', label: '프로젝트', note: '부원들이 만든 프로젝트' },
      { id: 'apps', label: '부원 작품', note: '바로 써 볼 수 있는 웹·앱' },
      { id: 'hackathon', label: '해커톤', note: '해커톤 작품과 결과' },
      { id: 'external-opportunities', label: '외부 일정', note: '대회 · 공모전 · 교육 모집' },
    ],
  },
]

const memberLinks = ['community', 'resources', 'monthly-calendar', 'team-projects', 'activity-events']
const toolLinks = ['gatherings', 'meet', 'attendance', 'draw']

type Props = {
  member: boolean
  latestNotice: { id: string | number; title: string } | null
  settings: SiteSettings
  activity: { title: string; days: number; live: boolean } | null
}

function activityWhen({ days, live }: { days: number; live: boolean }) {
  if (live) return '진행 중'
  return days === 0 ? '오늘' : `D-${days}`
}

function QuickLinks({ ids, label }: { ids: string[]; label: string }) {
  return (
    <ul className="compact-home__quick" aria-label={label}>
      {ids.map((id) => {
        const item = navItem(id)
        if (!item) return null
        const Icon = item.icon
        return (
          <li key={id}>
            <Link to={item.path}>{Icon && <Icon size={16} aria-hidden="true" />}{item.label}</Link>
          </li>
        )
      })}
    </ul>
  )
}

export default function CompactHome({ member, latestNotice, settings, activity }: Props) {
  const { hash } = useLocation()
  useEffect(() => {
    if (['#about', '#activities', '#projects', '#recruit'].includes(hash)) {
      document.getElementById(hash.slice(1))?.scrollIntoView()
    }
  }, [hash])

  const recruiting = /(모집|접수)\s*중(?!단|지)|상시/.test(settings.recruitmentStatus)

  return (
    <main className={`compact-home theme-home ${member ? 'compact-home--member' : ''}`}>
      <div className="compact-home__inner">
        <div className="compact-home__lead">
          <header id="opening" className="compact-home__intro">
            <h1>{settings.homeHeroTitle}</h1>
            <p>{settings.homeHeroCopy}</p>
          </header>

          <section className="compact-home__now" aria-labelledby="compact-now-title">
            <h2 id="compact-now-title" className="compact-home__now-title">지금 COM’s</h2>

            <div id="recruit" className="compact-home__recruit" data-open={recruiting || undefined}>
              <p className="compact-home__status">
                <i aria-hidden="true" />
                <strong>{settings.recruitCohort ? `${settings.recruitCohort} ` : ''}{settings.recruitmentStatus}</strong>
              </p>
              <p className="compact-home__period">{settings.recruitmentPeriod}</p>
              <div className="compact-home__actions">
                <Link className="compact-home__primary" to={navItem('recruit')?.path ?? '/recruit'}>지원하기</Link>
                <Link className="compact-home__secondary" to="/recruit-notice">모집 공지</Link>
              </div>
            </div>

            {activity && (
              <Link className="compact-home__next" to="/activities#act-upcoming">
                <CalendarDays size={18} aria-hidden="true" />
                <span><small>다음 일정</small><strong>{activity.title}</strong></span>
                <em>{activityWhen(activity)}</em>
              </Link>
            )}

            {member && (
              <>
                <Link className="compact-home__next" to={latestNotice ? `/notices/${encodeURIComponent(latestNotice.id)}` : '/notices'}>
                  <Megaphone size={18} aria-hidden="true" />
                  <span><small>최근 공지</small><strong>{latestNotice?.title || '공지사항 보기'}</strong></span>
                </Link>
                <QuickLinks ids={memberLinks} label="멤버 바로가기" />
                <h3 className="compact-home__tools-title">활동 도구</h3>
                <QuickLinks ids={toolLinks} label="활동 도구" />
              </>
            )}
          </section>
        </div>

        <nav className="compact-home__directory" aria-label="홈 한눈에 보기">
          {groups.map((group) => (
            <section id={group.id} key={group.id} className="compact-home__group" aria-labelledby={`compact-group-${group.id}`}>
              <h2 id={`compact-group-${group.id}`} className="compact-home__group-title">{group.title}</h2>
              <ul>
                {group.rows.map((row) => {
                  const item = navItem(row.id)
                  const Icon = row.icon ?? item?.icon
                  return (
                    <li key={row.id}>
                      <Link className="compact-home__row" to={row.path ?? item?.path ?? '/'}>
                        <span className="compact-home__icon" aria-hidden="true">{Icon && <Icon size={18} />}</span>
                        <span className="compact-home__row-text">
                          <strong>{row.label}</strong>
                          <small>{row.note}</small>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </main>
  )
}
