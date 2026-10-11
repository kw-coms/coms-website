const URL_RE = /https?:\/\/[^\s<>"']+/g

// Sentence punctuation that follows a URL is part of the sentence, not the link:
// "자료는 https://coms.kw.ac.kr/notice." must not link to `…/notice.`.
const TRAILING_PUNCTUATION = `.,;:!?)]'"`
const CLOSER_TO_OPENER = { ')': '(', ']': '[' }

const countOf = (value, char) => value.split(char).length - 1

/**
 * Trims sentence punctuation off the end of a matched URL. The trimmed characters
 * stay in the surrounding text, so nothing is lost from the rendered comment.
 *
 * A closing bracket that pairs with an opener inside the URL is kept — it belongs
 * to the link (Wikipedia's `/wiki/Foo_(bar)`), not to the sentence.
 */
export function trimTrailingPunctuation(rawUrl) {
  let url = String(rawUrl || '')
  while (url) {
    const last = url[url.length - 1]
    if (!TRAILING_PUNCTUATION.includes(last)) break
    const opener = CLOSER_TO_OPENER[last]
    if (opener && countOf(url, opener) >= countOf(url, last)) break
    url = url.slice(0, -1)
  }
  return url
}

// Theme token, not a fixed tint: the old `text-cyan-300` was unreadable on the light surfaces
// comments and posts sit on (about 1.6:1 against white).
const LINK_CLASS = 'text-[var(--app-accent-text)] underline underline-offset-2 hover:opacity-80 break-all'

/** Splits text into plain runs and the URLs between them, in order. */
function splitUrls(text) {
  const parts = []
  let last = 0
  let match
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) })
    }
    // `last` advances by the TRIMMED length, so the punctuation we dropped is
    // picked up by the next plain-text slice instead of disappearing.
    const url = trimTrailingPunctuation(match[0])
    parts.push({ url, index: match.index })
    last = match.index + url.length
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last) })
  }
  return parts
}

export function linkify(text) {
  if (!text) return null
  return splitUrls(text).map((part) => (part.url
    ? (
      <a
        key={part.index}
        href={part.url}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {part.url}
      </a>
    )
    : part.text))
}

const NO_AUTOLINK_ANCESTORS = 'a, code, pre'

/**
 * linkify() for content that is already HTML: wraps the URLs found in its text in anchors.
 *
 * Formatted post text is rendered from sanitized HTML, so linkify() never saw it and an address
 * typed into any paragraph with a line break or a bold word stayed dead text. Pass sanitized
 * HTML only — this adds anchors, it does not clean anything. Text inside an existing link or
 * inside code is left alone.
 */
export function linkifyHtml(html) {
  const source = String(html || '')
  if (!source || typeof document === 'undefined' || !/https?:\/\//.test(source)) return source

  const template = document.createElement('template')
  template.innerHTML = source
  const walker = document.createTreeWalker(template.content, 4 /* NodeFilter.SHOW_TEXT */)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)

  for (const node of textNodes) {
    if (node.parentElement?.closest(NO_AUTOLINK_ANCESTORS)) continue
    const parts = splitUrls(node.nodeValue || '')
    if (!parts.some((part) => part.url)) continue
    const fragment = document.createDocumentFragment()
    for (const part of parts) {
      if (!part.url) {
        fragment.appendChild(document.createTextNode(part.text))
        continue
      }
      const anchor = document.createElement('a')
      anchor.setAttribute('href', part.url)
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
      anchor.textContent = part.url
      fragment.appendChild(anchor)
    }
    node.parentNode.replaceChild(fragment, node)
  }
  return template.innerHTML
}
