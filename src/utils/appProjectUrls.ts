import { apiUrl } from '../services/apiClient'

export function safeProjectLinkUrl(value?: string): string | null {
  if (typeof value !== 'string' || Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function projectAddressLabel(linkUrl?: string, displayUrl?: string): string {
  const href = safeProjectLinkUrl(linkUrl)
  if (!href) return ''
  const target = new URL(href)
  const display = displayUrl?.trim()
  const displayHref = display && safeProjectLinkUrl(display.includes('://') ? display : 'https://' + display)
  const shown = displayHref ? new URL(displayHref) : target
  const sameHost = (a: URL, b: URL) => a.host.replace(/^www\./, '') === b.host.replace(/^www\./, '')
  const path = (shown.pathname === '/' && sameHost(shown, target) ? target.pathname : shown.pathname).replace(/\/$/, '')
  return shown.host.replace(/^www\./, '') + path
}

export function projectImageHref(value?: string): string | null {
  return /^\/api\/club-projects\/\d+\/images\/\d+$/.test(value ?? '') ? apiUrl(value) : null
}

export function projectFileHref(value?: string): string {
  // The backend generates this route; never turn arbitrary API data into a clickable URL.
  if (!/^\/api\/club-projects\/\d+\/files\/\d+\/download$/.test(value || '')) return '#'
  return apiUrl(value)
}
