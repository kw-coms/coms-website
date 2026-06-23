export const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Apple SD Gothic Neo', 'Segoe UI', 'Malgun Gothic', sans-serif"

export const BUILT_IN_FONTS = [
  {
    id: 'b:pretendard',
    name: 'Pretendard',
    family: 'Pretendard Variable',
    stylesheet: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css',
  },
  {
    id: 'b:noto-sans-kr',
    name: 'Noto Sans KR',
    family: 'Noto Sans KR',
    stylesheet: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap',
  },
  {
    id: 'b:ibm-plex-sans-kr',
    name: 'IBM Plex Sans KR',
    family: 'IBM Plex Sans KR',
    stylesheet: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap',
  },
  {
    id: 'b:nanum-gothic',
    name: 'Nanum Gothic',
    family: 'Nanum Gothic',
    stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap',
  },
  {
    id: 'b:gowun-dodum',
    name: 'Gowun Dodum',
    family: 'Gowun Dodum',
    stylesheet: 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap',
  },
  {
    id: 'b:nanum-myeongjo',
    name: 'Nanum Myeongjo',
    family: 'Nanum Myeongjo',
    stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap',
  },
]

export function sanitizeFontFamily(name) {
  return String(name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/["\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '')
    .trim()
    .slice(0, 64)
}

function safeFontUrl(raw) {
  const value = String(raw || '').trim()
  if (!value || /["()\s\\<>]/.test(value) || typeof window === 'undefined') return null
  try {
    const parsed = new URL(value, window.location.origin)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== window.location.origin) return null
    return encodeURI(parsed.pathname + parsed.search)
  } catch {
    return null
  }
}

export function buildFontFaceCss(fonts) {
  return fonts
    .map((font) => {
      const family = sanitizeFontFamily(font.name)
      const url = safeFontUrl(font.fileUrl)
      if (!family || !url) return ''
      return `@font-face{font-family:"${family}";src:url("${url}") format("woff2"),url("${url}");font-display:swap;}`
    })
    .filter(Boolean)
    .join('\n')
}

export function fontFamilyValue(font) {
  if (!font) return DEFAULT_FONT_FAMILY
  const family = sanitizeFontFamily(font.family || font.name)
  return family ? `"${family}", ${DEFAULT_FONT_FAMILY}` : DEFAULT_FONT_FAMILY
}

export function injectBuiltinFontStylesheets() {
  if (typeof document === 'undefined') return
  BUILT_IN_FONTS.forEach((font) => {
    const linkId = `builtin-font-${font.id}`
    if (document.getElementById(linkId)) return
    const link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    link.href = font.stylesheet
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  })
}
