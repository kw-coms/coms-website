export const DEFAULT_ACCENT = '#0071e3'
// v2: the default look is dark. The first key stored whatever the OS preferred on the first
// visit, so it cannot tell a deliberate choice from that default; it is no longer read.
export const THEME_MODE_KEY = 'kwcoms-theme-mode:v2'
export const ACCENT_COLOR_KEY = 'kwcoms-accent-color'
export const FONT_SELECTION_KEY = 'kwcoms-font-id'
export const INTRO_STYLE_KEY = 'kwcoms-intro-style:v1'
export const ACCENT_STRENGTH_KEY = 'kwcoms-accent-strength:v1'
export type IntroStyle = 'cinematic' | 'legacy' | 'off'
export type AccentStrength = 'standard' | 'vivid'

// localStorage throws (not just returns null) when site data is blocked or storage is full.
// Preferences are conveniences: on any failure fall back to the defaults instead of letting the
// first render crash the whole app.
export function readStoredValue(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storeValue(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Not remembered across visits; the current page still applies it.
  }
}

export function forgetStoredValue(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing stored that could be removed.
  }
}

export function getStoredFontId() {
  if (typeof window === 'undefined') return null
  const raw = readStoredValue(FONT_SELECTION_KEY)
  if (!raw) return null
  if (raw.startsWith('b:')) return raw
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function normalizeHex(value) {
  if (typeof value !== 'string') return DEFAULT_ACCENT
  const trimmed = value.trim()
  const shorthand = /^#?([0-9a-f]{3})$/i.exec(trimmed)
  if (shorthand) {
    return `#${shorthand[1].split('').map((char) => char + char).join('').toLowerCase()}`
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(trimmed)
  return full ? `#${full[1].toLowerCase()}` : DEFAULT_ACCENT
}

export function hexToRgb(hex) {
  const value = normalizeHex(hex).slice(1)
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

export function mixHex(base, overlay, overlayRatio) {
  const baseRgb = hexToRgb(base)
  const overlayRgb = hexToRgb(overlay)
  const ratio = Math.min(Math.max(overlayRatio, 0), 1)
  return rgbToHex({
    r: baseRgb.r * (1 - ratio) + overlayRgb.r * ratio,
    g: baseRgb.g * (1 - ratio) + overlayRgb.g * ratio,
    b: baseRgb.b * (1 - ratio) + overlayRgb.b * ratio,
  })
}

export function getStoredThemeMode() {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(THEME_MODE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function getStoredAccentColor() {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  return normalizeHex(readStoredValue(ACCENT_COLOR_KEY) || DEFAULT_ACCENT)
}

export function getStoredIntroStyle(): IntroStyle {
  const value = readStoredValue(INTRO_STYLE_KEY)
  return value === 'legacy' || value === 'off' ? value : 'cinematic'
}

export function getStoredAccentStrength(): AccentStrength {
  return readStoredValue(ACCENT_STRENGTH_KEY) === 'vivid' ? 'vivid' : 'standard'
}

export function getAccentTokens(color: string, themeMode: string, strength: AccentStrength = 'standard'): Record<string, string> {
  const accent = normalizeHex(color)
  const dark = themeMode === 'dark'
  const vivid = strength === 'vivid'
  return {
    '--app-accent': accent,
    '--app-accent-hover': mixHex(accent, dark ? '#ffffff' : '#000000', dark ? 0.14 : 0.08),
    '--app-accent-soft': mixHex(accent, dark ? '#17191f' : '#ffffff', vivid ? (dark ? 0.62 : 0.78) : (dark ? 0.8 : 0.88)),
    '--app-accent-text': mixHex(accent, dark ? '#ffffff' : '#000000', vivid ? (dark ? 0.52 : 0.62) : (dark ? 0.28 : 0.08)),
    '--app-accent-border': `color-mix(in srgb, ${accent} ${vivid ? 74 : 42}%, transparent)`,
  }
}

export function scrollToTopInstant() {
  if (typeof window === 'undefined') return
  const root = document.documentElement
  const previousBehavior = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  root.style.scrollBehavior = previousBehavior
}
