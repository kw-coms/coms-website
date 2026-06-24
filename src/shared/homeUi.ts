// Shared building blocks for the home-shell feature sections (activity log,
// club events, club calendar). Extracted verbatim from App.tsx — query keys,
// rich-text sanitizer, date helpers, category labels, shared button class
// strings, and the club-activity data hooks. The rich-text React components
// live in ./RichText. No behavior change.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sanitizeHtml } from '../utils/sanitizeHtml'
import { useAuth } from '../contexts/useAuth'
import { ActivityCategory } from '../contract/enums'
import { enumLabels } from '../contract/labels'
import { clubActivityCategories } from '../data/homeContent'
import { listClubActivities, listClubActivityCategories, listScheduleOccurrences } from '../services/clubActivityApi'

export const CLUB_ACTIVITIES_QUERY_KEY = ['app-shell', 'club-activities']
export const CLUB_EVENTS_QUERY_KEY = ['app-shell', 'club-events']
export const CLUB_ACTIVITY_CATEGORIES_QUERY_KEY = ['app-shell', 'club-activity-categories']
export const SCHEDULE_OCCURRENCES_QUERY_KEY = ['app-shell', 'schedule-occurrences']
export const RECURRING_SCHEDULES_QUERY_KEY = ['app-shell', 'recurring-schedules']
export const WEEKDAY_OPTIONS = [
  { value: 'MONDAY', label: '월' },
  { value: 'TUESDAY', label: '화' },
  { value: 'WEDNESDAY', label: '수' },
  { value: 'THURSDAY', label: '목' },
  { value: 'FRIDAY', label: '금' },
  { value: 'SATURDAY', label: '토' },
  { value: 'SUNDAY', label: '일' },
]
export const WEEKDAY_SHORT = {
  MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
  FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
}
export const SCHEDULE_COLOR_OPTIONS = ['#0071e3', '#34c759', '#ff9f0a', '#8e5cf7', '#ff3b30', '#00a7c7']
export const DEFAULT_SCHEDULE_COLOR = SCHEDULE_COLOR_OPTIONS[0]
const RICH_TEXT_ALLOWED_TAGS = new Set(['a', 'b', 'blockquote', 'br', 'div', 'em', 'font', 'h2', 'h3', 'i', 'li', 'ol', 'p', 'span', 'strong', 'u', 'ul'])
const RICH_TEXT_ALLOWED_STYLES = new Set(['background-color', 'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-align', 'text-decoration'])
export const RICH_TEXT_FONT_OPTIONS = [
  { value: 'Pretendard Variable', label: 'Pretendard' },
  { value: 'Noto Sans KR', label: 'Noto Sans KR' },
  { value: 'IBM Plex Sans KR', label: 'IBM Plex Sans KR' },
  { value: 'Nanum Gothic', label: 'Nanum Gothic' },
  { value: 'Gowun Dodum', label: 'Gowun Dodum' },
  { value: 'Nanum Myeongjo', label: 'Nanum Myeongjo' },
]

export const solidActionBtnClass = 'apple-action-primary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'
export const ghostActionBtnClass = 'apple-action-secondary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'

export function buildCalendarMonth(referenceDate = new Date()) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = (firstDay.getDay() + 6) % 7
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7
  return {
    title: `${year}년 ${month + 1}월`,
    year,
    month,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    leadingBlanks,
    trailingBlanks,
  }
}

export function parseLocalDate(value) {
  if (typeof value !== 'string') return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function formatActivityDate(value) {
  const date = parseLocalDate(value)
  if (!date) return value || ''
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextToRichHtml(value) {
  const text = String(value || '')
  if (!text.trim()) return ''
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('')
}

export function isSafeRichTextUrl(value) {
  if (!value) return false
  try {
    const base = typeof window === 'undefined' ? 'https://coms.kw.ac.kr' : window.location.origin
    const url = new URL(value, base)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

function sanitizeStyleValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized || /url\s*\(|expression\s*\(|javascript:|data:/i.test(normalized)) return ''
  return normalized.replace(/[<>"']/g, '')
}

function sanitizeRichTextStyle(styleText) {
  return String(styleText || '')
    .split(';')
    .map((chunk) => {
      const [rawProperty, ...rawValueParts] = chunk.split(':')
      const property = rawProperty?.trim().toLowerCase()
      if (!property || !RICH_TEXT_ALLOWED_STYLES.has(property)) return ''
      const value = sanitizeStyleValue(rawValueParts.join(':'))
      return value ? `${property}: ${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
}

export function sanitizeRichTextHtml(value) {
  const raw = String(value || '')
  if (!raw.trim()) return ''
  if (typeof document === 'undefined') {
    return sanitizeHtml(/<[a-z][\s\S]*>/i.test(raw) ? raw : plainTextToRichHtml(raw), {
      allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
      allowedStyles: RICH_TEXT_ALLOWED_STYLES,
      trimTrailingBreaks: false,
    })
  }

  const template = document.createElement('template')
  template.innerHTML = /<[a-z][\s\S]*>/i.test(raw) ? raw : plainTextToRichHtml(raw)

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment()

    const source = node
    const tagName = source.tagName.toLowerCase()
    if (!RICH_TEXT_ALLOWED_TAGS.has(tagName)) {
      const fragment = document.createDocumentFragment()
      source.childNodes.forEach((child) => fragment.appendChild(sanitizeNode(child)))
      return fragment
    }

    const outputTagName = tagName === 'font' ? 'span' : tagName
    const clean = document.createElement(outputTagName)
    const styleParts = []
    const styleText = sanitizeRichTextStyle(source.getAttribute('style') || '')
    if (styleText) styleParts.push(styleText)

    if (tagName === 'font') {
      const face = sanitizeStyleValue(source.getAttribute('face') || '')
      const color = sanitizeStyleValue(source.getAttribute('color') || '')
      if (face) styleParts.push(`font-family: ${face}`)
      if (color) styleParts.push(`color: ${color}`)
    }

    if (styleParts.length > 0) clean.setAttribute('style', styleParts.join('; '))
    if (tagName === 'a') {
      const href = source.getAttribute('href') || ''
      if (isSafeRichTextUrl(href)) {
        clean.setAttribute('href', href)
        clean.setAttribute('target', '_blank')
        clean.setAttribute('rel', 'noopener noreferrer')
      }
    }

    source.childNodes.forEach((child) => clean.appendChild(sanitizeNode(child)))
    return clean
  }

  const fragment = document.createDocumentFragment()
  template.content.childNodes.forEach((child) => fragment.appendChild(sanitizeNode(child)))
  const container = document.createElement('div')
  container.appendChild(fragment)
  return sanitizeHtml(container.innerHTML, {
    allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
    allowedStyles: RICH_TEXT_ALLOWED_STYLES,
    trimTrailingBreaks: false,
  })
}

function richTextToPlainText(value) {
  const raw = String(value || '')
  if (!raw.trim()) return ''
  if (typeof document === 'undefined') return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const div = document.createElement('div')
  div.innerHTML = sanitizeRichTextHtml(raw)
  return (div.textContent || '').replace(/\s+/g, ' ').trim()
}

export function isRichTextBlank(value) {
  return richTextToPlainText(value).length === 0
}

export function normalizeRichTextForSubmit(value) {
  const html = sanitizeRichTextHtml(value)
  return isRichTextBlank(html) ? '' : html.trim()
}

export { richTextToPlainText }

// Categories are admin-managed (DB-backed). Prefer the server-provided display
// name; fall back to the legacy hardcoded labels for any cached/older payloads.
// Keys bound to the canonical ClubActivity.Category enum (drift-guarded).
const ACTIVITY_CATEGORY_LABELS = enumLabels(ActivityCategory, {
  [ActivityCategory.GENERAL]: '일반',
  [ActivityCategory.SEMINAR]: '세미나',
  [ActivityCategory.STUDY]: '스터디',
  [ActivityCategory.PROJECT]: '프로젝트',
  [ActivityCategory.MEETING]: '회의',
  [ActivityCategory.RECRUIT]: '모집',
  [ActivityCategory.EVENT]: '행사',
  [ActivityCategory.MT]: 'MT',
  [ActivityCategory.ACHIEVEMENT]: '성과',
})

export function categoryLabel(value, fallbackName) {
  if (fallbackName) return fallbackName
  return ACTIVITY_CATEGORY_LABELS[value] || value || '일반'
}

// Shared loader for the two club-activity surfaces (activity log + calendar).
// Both read the full list and prepend optimistically after a create, so they
// share one cache entry — a create in one view refreshes the other for free.
export function useClubActivities(loadErrorMessage) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLUB_ACTIVITIES_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubActivities()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })

  const records = query.data ?? null
  const loading = Boolean(user && records === null && !query.error)
  const loadError = query.error ? (query.error.message || loadErrorMessage) : ''

  const prependActivity = (created) => {
    queryClient.setQueryData(CLUB_ACTIVITIES_QUERY_KEY, (prev) => [created, ...(Array.isArray(prev) ? prev : [])])
  }

  const mergeActivity = (updated) => {
    queryClient.setQueryData(CLUB_ACTIVITIES_QUERY_KEY, (prev) =>
      (Array.isArray(prev) ? prev : []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    )
  }

  const removeActivity = (id) => {
    queryClient.setQueryData(CLUB_ACTIVITIES_QUERY_KEY, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((item) => item.id !== id),
    )
  }

  return { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity }
}

// Admin-managed club-activity categories. Falls back to the static list so the
// dropdowns still render if the categories endpoint is unavailable.
export function useClubActivityCategories() {
  const { user, loading: authLoading } = useAuth()
  const query = useQuery({
    queryKey: CLUB_ACTIVITY_CATEGORIES_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubActivityCategories()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })
  const categories = query.data && query.data.length > 0
    ? query.data
    : clubActivityCategories.map(([key, name], position) => ({ key, name, position }))
  return categories
}

// Expanded recurring-schedule occurrences for the visible month (year/month).
export function useScheduleOccurrences(year, month) {
  const { user, loading: authLoading } = useAuth()
  const query = useQuery({
    queryKey: [...SCHEDULE_OCCURRENCES_QUERY_KEY, year, month],
    queryFn: async () => {
      const data = await listScheduleOccurrences(year, month + 1)
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })
  return query.data ?? []
}
