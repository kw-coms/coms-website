const URL_RE = /https?:\/\/[^\s<>"']+/g

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
    const url = match[0]
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
