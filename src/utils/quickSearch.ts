import { searchKey } from './listTools'

// The quick-jump dialog ("빠른 이동", Ctrl+K): what a query picks out of the places it can go
// to. Pure functions: components/QuickSearchDialog.tsx owns the state, and
// tests/quickSearch.test.mjs pins the behaviour.

export const QUICK_SEARCH_EVENT = 'coms:quick-search'

/** Opens the dialog from anywhere (the buttons in the header). */
export function openQuickSearch() {
  window.dispatchEvent(new Event(QUICK_SEARCH_EVENT))
}

export type QuickGroup = 'page' | 'notice' | 'post' | 'file' | 'poll'

export type QuickItem = {
  /** Unique across groups, e.g. "page:/about" or "notice:12". */
  id: string
  group: QuickGroup
  title: string
  /** Shown small beside the title. */
  hint?: string
  path: string
  /** Matched as well as the title and the hint, never shown. */
  keywords?: string
}

/** The groups in the order the dialog lists them. */
export const QUICK_GROUPS: { key: QuickGroup; label: string }[] = [
  { key: 'page', label: '페이지' },
  { key: 'notice', label: '공지사항' },
  { key: 'post', label: '커뮤니티' },
  { key: 'file', label: '자료실' },
  { key: 'poll', label: '일정 조율' },
]

const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
/** Syllables that share one initial consonant: 21 vowels by 28 finals. */
const SYLLABLES_PER_INITIAL = 588
const ONLY_INITIALS = /^[ㄱ-ㅎ]+$/

/**
 * "출석 체크" as "ㅊㅅㅊㅋ": the first consonant of each Hangul syllable. Other characters stay
 * (lower-cased) and spaces go, so a query typed as initials can be found in it.
 */
export function initialsOf(text: unknown): string {
  let out = ''
  for (const char of String(text ?? '').toLowerCase()) {
    const code = char.charCodeAt(0)
    if (code >= HANGUL_FIRST && code <= HANGUL_LAST) out += INITIALS[Math.floor((code - HANGUL_FIRST) / SYLLABLES_PER_INITIAL)]
    else if (!/\s/.test(char)) out += char
  }
  return out
}

/**
 * How well an item answers the query; 0 when it does not. Every word has to be found: at the
 * start of the title counts most, inside the title next, in the hint or keywords least. A
 * query made only of initial consonants ("ㅊㅅ") is matched against the title's initials.
 */
export function quickScore(item: QuickItem, query: string): number {
  const words = String(query ?? '').split(/\s+/).map(searchKey).filter(Boolean)
  if (words.length === 0) return 1
  const joined = words.join('')
  if (ONLY_INITIALS.test(joined)) {
    const initials = initialsOf(item.title)
    if (initials.startsWith(joined)) return 4
    return initials.includes(joined) ? 3 : 0
  }
  const title = searchKey(item.title)
  const rest = searchKey(`${item.hint ?? ''} ${item.keywords ?? ''}`)
  let score = 0
  for (const word of words) {
    if (title.startsWith(word)) score += 4
    else if (title.includes(word)) score += 3
    else if (rest.includes(word)) score += 1
    else return 0
  }
  return score
}

/** `start` is the place of the group's first item in the one list the arrow keys walk. */
export type QuickResultGroup = { key: QuickGroup; label: string; items: QuickItem[]; start: number }

/**
 * What the dialog lists for a query: the groups that have a match, in their fixed order, each
 * with its best matches first (ties keep the order the items came in) and at most `perGroup`
 * of them. With no query only the pages are listed, all of them: the dialog opens as a menu.
 */
export function searchQuickItems(items: readonly QuickItem[], query: string, perGroup = 5): QuickResultGroup[] {
  const blank = String(query ?? '').trim() === ''
  const groups = QUICK_GROUPS
    .map(({ key, label }) => {
      if (blank) return { key, label, items: key === 'page' ? items.filter((item) => item.group === 'page') : [] }
      const matches = items
        .filter((item) => item.group === key)
        .map((item) => ({ item, score: quickScore(item, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, perGroup)
        .map((entry) => entry.item)
      return { key, label, items: matches }
    })
    .filter((group) => group.items.length > 0)
  let start = 0
  return groups.map((group) => {
    const placed = { ...group, start }
    start += group.items.length
    return placed
  })
}

/** Where the highlight lands after an arrow key: it wraps round both ends, and stays at 0 in an empty list. */
export function moveQuickIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return ((current + delta) % count + count) % count
}

/** "10월 3일" for the small date beside a result; "" when the value is not a date. */
export function quickDate(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}
