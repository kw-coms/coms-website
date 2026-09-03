export const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Apple SD Gothic Neo', 'Segoe UI', 'Malgun Gothic', sans-serif"

export const BUILT_IN_FONTS = [
  {
    id: 'b:pretendard',
    name: 'Pretendard',
    family: 'Pretendard Variable',
    // dynamic-subset, not the single-file build: the one-@font-face version has no
    // unicode-range, so every visitor downloads the whole 2 MB variable woff2 before
    // first paint. The subset build splits it into unicode-range slices and the
    // browser fetches only the ones the page's glyphs actually land in.
    stylesheet: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
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

// Injects the stylesheet for ONE built-in font — the one actually applied.
// Injecting all six on mount cost every visitor 2 MB of Pretendard plus ~200 KB of
// Google Fonts CSS for fonts nobody had selected. Already-added links are kept so
// switching fonts in settings stays instant and never re-adds a <link>.
export function injectBuiltinFontStylesheet(fontId) {
  if (typeof document === 'undefined') return
  const font = BUILT_IN_FONTS.find((item) => String(item.id) === String(fontId))
  if (!font) return
  const linkId = `builtin-font-${font.id}`
  if (document.getElementById(linkId)) return
  const link = document.createElement('link')
  link.id = linkId
  link.rel = 'stylesheet'
  link.href = font.stylesheet
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}
