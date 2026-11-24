import { useEffect, useState } from 'react'
import { previewClubActivityStatus } from '../../services/clubActivityApi'
import { selectedTerm, termForDate, type TimelineFields } from './activityTimelineForm'

const statusNames: Record<string, string> = {
  PLANNED: '예정', CONFIRMED: '확정', LIVE: '진행 중', DONE: '완료',
}
const seasons = ['1학기', '여름방학', '2학기', '겨울방학']
const inputClass = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

export function ActivityTimelineFields({ value, onChange }: {
  value: TimelineFields
  onChange: (patch: Partial<TimelineFields>) => void
}) {
  const previewKey = JSON.stringify([value.dateUndecided, value.eventDate, value.endDate, value.startTime, value.endTime])
  const [preview, setPreview] = useState({ key: '', status: '', error: false })

  useEffect(() => {
    let active = true
    const refresh = () => previewClubActivityStatus(value.dateUndecided ? {} : {
      eventDate: value.eventDate, endDate: value.endDate,
      startTime: value.startTime, endTime: value.endTime,
    }).then((preview) => {
      if (active) setPreview({ key: previewKey, status: preview.resolvedStatus, error: false })
    }).catch(() => { if (active) setPreview({ key: previewKey, status: '', error: true }) })
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [previewKey, value.dateUndecided, value.eventDate, value.endDate, value.startTime, value.endTime])

  const selected = selectedTerm(value)
  const year = Number(selected.slice(0, 4)) || Number(termForDate('').slice(0, 4))
  const years = [year - 1, year, year + 1]

  return <>
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
      <input type="checkbox" checked={value.dateUndecided} onChange={(event) => onChange(event.target.checked
        ? { dateUndecided: true, eventDate: '', endDate: '', startTime: '', endTime: '' }
        : { dateUndecided: false })} />
      날짜 미정
    </label>
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
      <input type="checkbox" checked={value.showOnTimeline} onChange={(event) => onChange({ showOnTimeline: event.target.checked })} />
      타임라인에 표시
    </label>
    <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
      상태
      <select value={value.timelineStatus} onChange={(event) => onChange({ timelineStatus: event.target.value })} className={inputClass}>
        <option value="">자동</option>
        {Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
      <span aria-live="polite" className="font-normal">{preview.key !== previewKey ? '자동 상태 계산 중…' : preview.error ? '자동 상태를 불러오지 못했습니다.' : `자동이면 현재 ${statusNames[preview.status] || '계산 중…'}`}</span>
    </label>
    <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
      학기
      <select value={selected} onChange={(event) => onChange({ timelineTerm: event.target.value })} className={inputClass}>
        {years.flatMap((optionYear) => seasons.map((season) => {
          const term = `${optionYear} ${season}`
          return <option key={term} value={term}>{term}</option>
        }))}
      </select>
    </label>
    <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
      날짜 표시 문구 (선택)
      <input value={value.dateLabel} onChange={(event) => onChange({ dateLabel: event.target.value })} maxLength={40} placeholder="예: 12월 중" className={inputClass} />
    </label>
  </>
}
