import DOMPurify from 'dompurify'

const DEFAULT_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'font',
  'h2',
  'h3',
  'i',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]

const DEFAULT_ALLOWED_ATTRIBUTES = ['class', 'color', 'face', 'href', 'rel', 'style', 'target']
const DEFAULT_ALLOWED_STYLES = new Set([
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-align',
  'text-decoration',
])

// Rich-text editor / home-shell surfaces legitimately render a slightly
// different tag set than plain post bodies (no <mark>, but otherwise the same
// formatting tags). Exposed as a named profile so every HTML sink shares ONE
// allow-list source of truth instead of hand-rolling a second sanitizer.
const RICH_TEXT_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'div',
  'code',
  'em',
  'font',
  'h2',
  'h3',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]

export const SANITIZE_PROFILES = {
  richText: {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: DEFAULT_ALLOWED_ATTRIBUTES,
    allowedStyles: DEFAULT_ALLOWED_STYLES,
    trimTrailingBreaks: false,
  },
}

const DANGEROUS_STYLE_VALUE_RE = /url\s*\(|expression\s*\(|javascript:|data:/i
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
// `class` is allowed ONLY so a single language hint (e.g. `language-js`) can ride
// along on code/pre for syntax highlighting. Anything else is a CSS-injection /
// styling-hijack surface, so we constrain it to this exact shape and strip class
// from every other tag in postProcessAttributes below.
const SAFE_CODE_CLASS_RE = /^language-[a-z0-9]+$/i

// Pure (DOM-free) decision used by postProcessAttributes so the class-attribute
// constraint is a single source of truth and unit-testable without a browser:
// keep a `language-*` class only on <code>/<pre>, strip class everywhere else.
export function sanitizeClassAttribute(tagName, rawClass) {
  const tag = String(tagName || '').toLowerCase()
  const value = String(rawClass || '').trim()
  if ((tag === 'code' || tag === 'pre') && SAFE_CODE_CLASS_RE.test(value)) return value
  return ''
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeStyleValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized || DANGEROUS_STYLE_VALUE_RE.test(normalized)) return ''
  return normalized.replace(/[<>"']/g, '')
}

export function sanitizeStyleDeclaration(styleText, allowedStyles = DEFAULT_ALLOWED_STYLES) {
  return String(styleText || '')
    .split(';')
    .map((chunk) => {
      const [rawProperty, ...rawValueParts] = chunk.split(':')
      const property = rawProperty?.trim().toLowerCase()
      if (!property || !allowedStyles.has(property)) return ''
      const value = sanitizeStyleValue(rawValueParts.join(':'))
      return value ? `${property}: ${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
}

export function isSafeUrl(value) {
  if (!value) return false
  try {
    const base = typeof window === 'undefined' ? 'https://coms.kw.ac.kr' : window.location.origin
    const url = new URL(value, base)
    return SAFE_URL_PROTOCOLS.has(url.protocol)
  } catch {
    return false
  }
}

function postProcessAttributes(container, allowedStyles) {
  container.querySelectorAll('[style]').forEach((element) => {
    const style = sanitizeStyleDeclaration(element.getAttribute('style'), allowedStyles)
    if (style) {
      element.setAttribute('style', style)
    } else {
      element.removeAttribute('style')
    }
  })

  container.querySelectorAll('font').forEach((element) => {
    const face = sanitizeStyleValue(element.getAttribute('face'))
    const color = sanitizeStyleValue(element.getAttribute('color'))
    if (face) element.setAttribute('face', face)
    else element.removeAttribute('face')
    if (color) element.setAttribute('color', color)
    else element.removeAttribute('color')
  })

  container.querySelectorAll('[class]').forEach((element) => {
    const safeClass = sanitizeClassAttribute(element.tagName, element.getAttribute('class'))
    if (safeClass) {
      element.setAttribute('class', safeClass)
    } else {
      element.removeAttribute('class')
    }
  })

  container.querySelectorAll('a').forEach((element) => {
    const href = element.getAttribute('href') || ''
    if (!isSafeUrl(href)) {
      element.removeAttribute('href')
      element.removeAttribute('target')
      element.removeAttribute('rel')
      return
    }
    element.setAttribute('target', '_blank')
    element.setAttribute('rel', 'noopener noreferrer')
  })
}

export interface SanitizeHtmlOptions {
  profile?: keyof typeof SANITIZE_PROFILES
  allowedTags?: string[]
  allowedAttributes?: string[]
  allowedStyles?: Set<string>
  trimTrailingBreaks?: boolean
}

export function sanitizeHtml(value, options: SanitizeHtmlOptions = {}) {
  const raw = String(value || '')
  if (!raw.trim()) return ''
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return escapeHtml(raw)
  }

  const profile: Partial<(typeof SANITIZE_PROFILES)[keyof typeof SANITIZE_PROFILES]> =
    (options.profile && SANITIZE_PROFILES[options.profile]) || {}
  const allowedTags = options.allowedTags || profile.allowedTags || DEFAULT_ALLOWED_TAGS
  const allowedAttributes = options.allowedAttributes || profile.allowedAttributes || DEFAULT_ALLOWED_ATTRIBUTES
  const allowedStyles = options.allowedStyles || profile.allowedStyles || DEFAULT_ALLOWED_STYLES
  const trimTrailingBreaks = [options.trimTrailingBreaks, profile.trimTrailingBreaks].find((flag) => flag !== undefined) ?? true

  // NO `USE_PROFILES` here: DOMPurify OVERWRITES ALLOWED_TAGS/ALLOWED_ATTR with the
  // built-in profile set when USE_PROFILES is present (purify: `ALLOWED_TAGS = addToSet({}, text)`
  // then `addToSet(ALLOWED_TAGS, html)`), which silently re-admitted <img>/<form>/<input>/<table>
  // and every default HTML attribute. The explicit allow-lists below are the only source of truth.
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['embed', 'iframe', 'math', 'object', 'script', 'style', 'svg', 'template'],
    KEEP_CONTENT: true,
    SAFE_FOR_TEMPLATES: true,
  })
  const template = document.createElement('template')
  template.innerHTML = clean
  const container = document.createElement('div')
  container.appendChild(template.content.cloneNode(true))
  postProcessAttributes(container, allowedStyles)

  const html = container.innerHTML.replace(/\u200B/g, '')
  return trimTrailingBreaks === false
    ? html
    : html.replace(/(<br\s*\/?>\s*)+$/gi, '')
}
