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

export function projectFileHref(value?: string): string {
  // The backend generates this route; never turn arbitrary API data into a clickable URL.
  if (!/^\/api\/club-projects\/\d+\/files\/\d+\/download$/.test(value || '')) return '#'
  return apiUrl(value)
}
