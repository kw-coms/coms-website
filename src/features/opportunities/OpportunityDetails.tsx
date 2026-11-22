import { ExternalLink } from 'lucide-react'
import type { OpportunityDates as Dates } from '../../services/opportunityApi'

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
