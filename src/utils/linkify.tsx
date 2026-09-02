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

export function linkify(text) {
  if (!text) return null
  const parts = []
  let last = 0
  let match
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    // `last` advances by the TRIMMED length, so the punctuation we dropped is
    // picked up by the next plain-text slice instead of disappearing.
    const url = trimTrailingPunctuation(match[0])
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-300 underline underline-offset-2 hover:text-cyan-100 break-all"
      >
        {url}
      </a>
    )
    last = match.index + url.length
  }
  if (last < text.length) {
    parts.push(text.slice(last))
  }
  return parts
}
