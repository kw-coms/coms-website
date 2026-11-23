import { ExternalLink } from 'lucide-react'
import type { OpportunityDates as Dates } from '../../services/opportunityApi'
import { opportunityPhases, type OpportunityPhase } from './opportunityStatus'

function DateValue({ value }: { value: string }) {
  return <time dateTime={value.length > 10 ? value + '+09:00' : value}>{value.replace('T', ' ')}</time>
}

function Period({ start, end, until }: { start: string | null; end: string | null; until: string }) {
  if (start && end && start !== end) return <><DateValue value={start} /> ~ <DateValue value={end} /></>
  if (start) return <DateValue value={start} />
  if (end) return <><DateValue value={end} /> {until}</>
  return <span className="text-[var(--app-muted)]">미정</span>
}

export function OpportunityDates({ dates }: { dates: Dates }) {
  return <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-sm">
    <dt className="font-semibold">신청</dt>
    <dd className="min-w-0 break-words"><Period start={dates.applicationStart} end={dates.applicationEnd} until="마감" /></dd>
    <dt className="font-semibold">행사·교육</dt>
    <dd className="min-w-0 break-words"><Period start={dates.eventStart} end={dates.eventEnd} until="종료" /></dd>
  </dl>
}

const phaseLabels: Record<OpportunityPhase, string> = {
  upcoming: '시작 전', ongoing: '진행 중', ended: '종료', unknown: '일정 미정',
}

export function OpportunityStatusBadges({ dates, now }: { dates: Dates; now: number }) {
  const phases = opportunityPhases(dates, now)
  const applicationLabel = phases.application === 'ongoing' && !dates.applicationStart
    ? '마감 전' : ({ upcoming: '시작 전', ongoing: '진행 중', ended: '마감', unknown: '미정' } as const)[phases.application]
  const eventLabel = phases.event === 'ongoing' && !dates.eventStart ? '종료 전' : phaseLabels[phases.event]
  const badge = 'inline-flex min-h-7 items-center rounded-full border border-[var(--app-hairline)] px-2.5 py-1 text-xs font-semibold data-[phase=ended]:text-[var(--app-muted)] data-[phase=ongoing]:border-emerald-500/40 data-[phase=ongoing]:text-emerald-600 data-[phase=upcoming]:border-sky-500/40 data-[phase=upcoming]:text-sky-600'
  return <div className="mt-3 flex flex-wrap gap-2" aria-label="일정 상태">
    <span className={badge} data-phase={phases.application}>신청 {applicationLabel}</span>
    <span className={badge} data-phase={phases.event}>행사 {eventLabel}</span>
  </div>
}

export function OpportunitySourceLink({ url, title }: { url: string; title: string }) {
  let href: string
  try {
    const target = new URL(url)
    if (target.protocol !== 'https:' || target.username || target.password) return null
    href = target.href
  } catch {
    return null
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${title} 공식 공고 (새 탭)`}
    className="apple-action-secondary inline-flex min-h-11 max-w-full items-center gap-2 px-4 text-sm">
    공식 공고 <ExternalLink size={15} aria-hidden="true" className="shrink-0" />
  </a>
}
