import type { ReactNode } from 'react'
import { ArrowRight, FolderOpen, Megaphone, MessagesSquare } from 'lucide-react'
import { activityHubItems, activitySectionNavItems, navGroups } from '../../../data/homeContent'
import MemberLock from '../../../components/MemberLock'
import ClubCalendarSection from '../../../features/clubCalendar/ClubCalendarSection'
import { CineTitle, Slate } from './parts'
import { cssVars } from './cssVars'

const HUB_ICONS = [Megaphone, MessagesSquare, FolderOpen]
const MEMBER_PATHS = new Set(navGroups.flatMap(group => group.items).filter(item => item.auth).map(item => item.path))

type Props = {
  index: number
  member: boolean
  noticeTitle: string | null
  onGo: (path: string) => void
  backdrop: ReactNode
}

// Scene 5 for a visitor ("멤버가 되면": what opens up, locks shown, no calendar). For a member it
// moves up under the opening as "오늘의 COM's" and leads with function: the latest notice, the
// hub, the tools and the calendar.
export default function Members({ index, member, noticeTitle, onGo, backdrop }: Props) {
  return (
    <section id="members" data-scene="members" className={`scene scene-members ${member ? 'scene-members--today' : ''}`} aria-labelledby={member ? 'home-today-title' : undefined}>
      {backdrop}
      <div className="scene-inner">
        {member ? (
          <header className="scene-members__header">
            <p className="scene-members__eyebrow">멤버 홈</p>
            <h2 id="home-today-title" className="scene-title">오늘의 COM's</h2>
          </header>
        ) : (
          <>
            <Slate index={index} name="Members" />
            <CineTitle text="멤버가 되면" />
            <p className="scene-lede" data-cine style={cssVars({ '--i': 2 })}>
              공지, 커뮤니티와 회원 자료, 활동 도구가 열립니다.
            </p>
          </>
        )}
        {member && noticeTitle && (
          <button type="button" className="scene-notice scene-notice--lead" onClick={() => onGo('/notices')}>
            <span className="scene-members__icon"><Megaphone size={19} aria-hidden="true" /></span>
            <span className="scene-notice__content">
              <span className="scene-notice__tag">최근 공지</span>
              <span className="scene-notice__title">{noticeTitle}</span>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}

        <ul className="scene-hub">
          {activityHubItems.map((item, i) => {
            const Icon = HUB_ICONS[i % HUB_ICONS.length]
            return (
              <li key={item.title} data-cine={member ? undefined : ''} style={member ? undefined : cssVars({ '--i': i })}>
                <article className="scene-hubcard" data-rule>
                  {member ? <span className="scene-members__icon"><Icon size={19} aria-hidden="true" /></span> : <Icon size={20} aria-hidden="true" />}
                  <h3 className="scene-hubcard__title">
                    <button type="button" className="scene-hubcard__link" onClick={() => onGo(item.route)}>
                      {item.title} {MEMBER_PATHS.has(item.route) && <MemberLock />}
                    </button>
                  </h3>
                  <p className="scene-hubcard__body">{item.body}</p>
                  <span className="scene-hubcard__go" aria-hidden="true">
                    <span>{item.cta}</span> <ArrowRight size={15} />
                  </span>
                </article>
              </li>
            )
          })}
        </ul>

        {member && <h3 id="home-activity-tools" className="scene-members__tools-title">활동 도구 바로가기</h3>}
        <ul className="scene-chips" aria-labelledby={member ? 'home-activity-tools' : undefined} aria-label={member ? undefined : '활동 도구 바로가기'}>
          {activitySectionNavItems.map((item, i) => (
            <li key={item.id} data-cine={member ? undefined : 'ripple'} style={member ? undefined : cssVars({ '--i': i })}>
              <button type="button" className="scene-chip" onClick={() => onGo(item.path)}>
                <item.icon size={15} aria-hidden="true" />
                <span className="scene-chip__label">{item.hint}</span>
                {!member && <span className="scene-chip__sub" aria-hidden="true">{item.label}</span>}
                {item.auth && <MemberLock size={10} />}
              </button>
            </li>
          ))}
        </ul>

        {member && (
          <div className="scene-members__calendar">
            <ClubCalendarSection compact />
          </div>
        )}
      </div>
    </section>
  )
}
