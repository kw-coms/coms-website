export function toEventDateTime(value, endOfDay = false) {
  if (!value) return ''
  return `${value}T${endOfDay ? '23:59:00' : '00:00:00'}`
}

export function formatEventDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatEventWindow(event) {
  const start = formatEventDateTime(event.startsAt)
  const end = formatEventDateTime(event.endsAt)
  return [start, end].filter(Boolean).join(' ~ ')
}

export function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

export const EMPTY_CLUB_EVENT_ENTRY_FORM = {
  title: '',
  authorName: '',
  workType: 'MAGAZINE',
  summary: '',
  tags: '',
  externalUrl: '',
  description: '',
}

export const CLUB_EVENT_WORK_TYPE_OPTIONS = [
  { value: 'MAGAZINE', label: '회지' },
  { value: 'WEBZINE', label: '웹진' },
  { value: 'SOURCE', label: '원본/소스' },
  { value: 'DESIGN', label: '디자인' },
  { value: 'OTHER', label: '기타 작품' },
]

export function clubEventWorkTypeLabel(value) {
  return CLUB_EVENT_WORK_TYPE_OPTIONS.find((option) => option.value === value)?.label || ''
}

export const CLUB_EVENT_RSVP_OPTIONS = [
  { value: 'GOING', label: '참석', countKey: 'goingCount' },
  { value: 'MAYBE', label: '미정', countKey: 'maybeCount' },
  { value: 'NOT_GOING', label: '불참', countKey: 'notGoingCount' },
]

export function clubEventEntryTags(value) {
  return String(value || '')
    .split(/[,\n#]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function mergeFileList(currentFiles, nextFiles) {
  const merged = [...(currentFiles || [])]
  const seen = new Set(merged.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
  for (const file of Array.from(nextFiles || []) as File[]) {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (!seen.has(key)) {
      merged.push(file)
      seen.add(key)
    }
  }
  return merged
}

export function isEventImageFile(file) {
  const type = String(file?.type || '').toLowerCase()
  const name = String(file?.name || '').toLowerCase()
  return type.startsWith('image/') || /\.(avif|gif|jpe?g|png|webp)$/i.test(name)
}

/** Contest wording (votes, ranking, entries) only fits events that have entries or an open vote. */
export function isContestEvent(event) {
  return Boolean(event?.votingOpen) || Number(event?.entryCount ?? event?.entries?.length ?? 0) > 0
}

/** 0 = open now, 1 = upcoming, 2 = closed. */
export function clubEventPhase(event, now = Date.now()) {
  if (event?.votingOpen) return 0
  const starts = new Date(event?.startsAt).getTime()
  if (Number.isFinite(starts) && starts > now) return 1
  return 2
}

/** Open events first, then upcoming, then closed; newest start first inside each group. */
export function sortClubEvents(events, now = Date.now()) {
  const startOf = (event) => {
    const time = new Date(event?.startsAt).getTime()
    return Number.isFinite(time) ? time : 0
  }
  return [...(events || [])].sort((a, b) => clubEventPhase(a, now) - clubEventPhase(b, now) || startOf(b) - startOf(a) || (b.id ?? 0) - (a.id ?? 0))
}
