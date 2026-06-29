import DOMPurify from 'dompurify'

const DEFAULT_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
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
  'span',
  'strong',
  'u',
  'ul',
]

const DEFAULT_ALLOWED_ATTRIBUTES = ['color', 'face', 'href', 'rel', 'style', 'target']
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
  'em',
  'font',
  'h2',
  'h3',
  'i',
  'li',
  'ol',
  'p',
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

export function sanitizeHtml(value, options: any = {}) {
  const raw = String(value || '')
  if (!raw.trim()) return ''
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return escapeHtml(raw)
  }

  const profile = (options.profile && SANITIZE_PROFILES[options.profile]) || {}
  const allowedTags = options.allowedTags || profile.allowedTags || DEFAULT_ALLOWED_TAGS
  const allowedAttributes = options.allowedAttributes || profile.allowedAttributes || DEFAULT_ALLOWED_ATTRIBUTES
  const allowedStyles = options.allowedStyles || profile.allowedStyles || DEFAULT_ALLOWED_STYLES
  const trimTrailingBreaks = [options.trimTrailingBreaks, profile.trimTrailingBreaks].find((flag) => flag !== undefined) ?? true

  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
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
