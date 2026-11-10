import { ArrowRight, FolderOpen, Megaphone, MessagesSquare } from 'lucide-react'
import { activityHubItems, activitySectionNavItems } from '../../../data/homeContent'
import MemberLock from '../../../components/MemberLock'
import ClubCalendarSection from '../../../features/clubCalendar/ClubCalendarSection'
import { CineTitle, Slate, cssVars } from './parts'

const HUB_ICONS = [Megaphone, MessagesSquare, FolderOpen]

type Props = {
  index: number
  member: boolean
  noticeTitle: string | null
  onGo: (path: string) => void
}

// Scene 5 for a visitor ("멤버가 되면": what opens up, locks shown, no calendar). For a member it
// moves up under the opening as "오늘의 COM's" and leads with function: the latest notice, the
// hub, the tools and the calendar.
export default function Members({ index, member, noticeTitle, onGo }: Props) {
  return (
    <section id="members" className={`scene scene-members ${member ? 'scene-members--today' : ''}`}>
      <div className="scene-inner">
        <Slate index={index} name={member ? 'Today' : 'Members'} />
        <CineTitle text={member ? "오늘의 COM's" : '멤버가 되면'} />
        {!member && (
          <p className="scene-lede" data-cine style={cssVars({ '--i': 2 })}>
            공지, 커뮤니티, 자료실과 활동 도구가 열립니다.
          </p>
        )}
        {member && noticeTitle && (
          <button type="button" className="scene-notice scene-notice--lead" data-cine onClick={() => onGo('/notices')}>
            <Megaphone size={14} aria-hidden="true" />
            <span className="scene-notice__title">{noticeTitle}</span>
            <span className="scene-notice__tag">최근 공지</span>
          </button>
        )}

        <ul className="scene-hub">
          {activityHubItems.map((item, i) => {
            const Icon = HUB_ICONS[i % HUB_ICONS.length]
            return (
              <li key={item.title} data-cine style={cssVars({ '--i': i })}>
                <button type="button" className="scene-hubcard" onClick={() => onGo(item.route)}>
                  <Icon size={20} aria-hidden="true" />
                  <span className="scene-hubcard__title">{item.title} <MemberLock /></span>
                  <span className="scene-hubcard__body">{item.body}</span>
                  <span className="scene-hubcard__go">{item.cta} <ArrowRight size={15} aria-hidden="true" /></span>
                </button>
              </li>
            )
          })}
        </ul>

        <ul className="scene-chips" aria-label="활동 도구 바로가기" data-cine>
          {activitySectionNavItems.map((item) => (
            <li key={item.id}>
              <button type="button" className="scene-chip" onClick={() => onGo(item.path)}>
                <item.icon size={15} aria-hidden="true" />
                <span className="scene-chip__label">{item.hint}</span>
                {/* The menu's English name, for the eye only. */}
                <span className="scene-chip__sub" aria-hidden="true">{item.label}</span>
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
