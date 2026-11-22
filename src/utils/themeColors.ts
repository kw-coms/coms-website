export const DEFAULT_ACCENT = '#0071e3'
// v2: the default look is dark. The first key stored whatever the OS preferred on the first
// visit, so it cannot tell a deliberate choice from that default; it is no longer read.
export const THEME_MODE_KEY = 'kwcoms-theme-mode:v2'
export const ACCENT_COLOR_KEY = 'kwcoms-accent-color'
export const APPEARANCE_THEME_KEY = 'kwcoms-appearance-theme:v1'
export const FONT_SELECTION_KEY = 'kwcoms-font-id'
export const INTRO_STYLE_KEY = 'kwcoms-intro-style:v1'
export const ACCENT_STRENGTH_KEY = 'kwcoms-accent-strength:v1'
export type IntroStyle = 'cinematic' | 'legacy' | 'off'
export type AccentStrength = 'standard' | 'vivid'

export const APPEARANCE_THEMES = [
  { value: 'standard', label: '기본', description: 'COM’s 기본 화면', lightAccent: DEFAULT_ACCENT, darkAccent: DEFAULT_ACCENT },
  { value: 'terminal', label: '터미널', description: '명령어 창과 디렉터리 목록', lightAccent: '#17653e', darkAccent: '#42e88e' },
  { value: 'retro', label: '레트로', description: '청록색 데스크톱과 파일 탐색기', lightAccent: '#26539b', darkAccent: '#91c6ff' },
  { value: 'blueprint', label: '청사진', description: '제도 격자와 도면형 패널', lightAccent: '#245ebb', darkAccent: '#70b9fa' },
] as const

export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]['value']
type AppearanceAccents = Partial<Record<AppearanceTheme, string>>

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

export function getStoredAppearanceTheme(): AppearanceTheme {
  const stored = readStoredValue(APPEARANCE_THEME_KEY)
  return APPEARANCE_THEMES.find(({ value }) => value === stored)?.value ?? 'standard'
}

export function getAppearanceAccent(theme: AppearanceTheme, mode: string) {
  const design = APPEARANCE_THEMES.find(({ value }) => value === theme) ?? APPEARANCE_THEMES[0]
  return mode === 'dark' ? design.darkAccent : design.lightAccent
}

function appearanceAccentKey(theme: AppearanceTheme) {
  return theme === 'standard' ? ACCENT_COLOR_KEY : `kwcoms-appearance-accent:v1:${theme}`
}

export function getStoredAppearanceAccents(): AppearanceAccents {
  const accents: AppearanceAccents = {}
  for (const { value } of APPEARANCE_THEMES) {
    const stored = readStoredValue(appearanceAccentKey(value))
    if (stored) accents[value] = normalizeHex(stored)
  }
  return accents
}

export function storeAppearanceAccent(theme: AppearanceTheme, color: string | undefined) {
  const key = appearanceAccentKey(theme)
  if (color === undefined) forgetStoredValue(key)
  else storeValue(key, color)
}

export function getStoredIntroStyle(): IntroStyle {
  const value = readStoredValue(INTRO_STYLE_KEY)
  return value === 'legacy' || value === 'off' ? value : 'cinematic'
}

export function getStoredAccentStrength(): AccentStrength {
  return readStoredValue(ACCENT_STRENGTH_KEY) === 'vivid' ? 'vivid' : 'standard'
}

function getAccentForeground(color: string) {
  const { r, g, b } = hexToRgb(color)
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  const blackContrast = (luminance + 0.05) / 0.05
  const whiteContrast = 1.05 / (luminance + 0.05)
  return blackContrast > whiteContrast ? '#000000' : '#ffffff'
}

export function getAccentTokens(color: string, themeMode: string, strength: AccentStrength = 'standard'): Record<string, string> {
  const accent = normalizeHex(color)
  const dark = themeMode === 'dark'
  const vivid = strength === 'vivid'
  const hover = mixHex(accent, dark ? '#ffffff' : '#000000', dark ? 0.14 : 0.08)
  return {
    '--app-accent': accent,
    '--app-accent-hover': hover,
    '--app-accent-on': getAccentForeground(accent),
    '--app-accent-hover-on': getAccentForeground(hover),
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
