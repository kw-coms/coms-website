import type { ReactNode } from 'react'

function inline(text: string, keyPrefix = ''): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
  let start = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index
    if (at > start) parts.push(text.slice(start, at))
    const token = match[0]
    parts.push(token.startsWith('**')
      ? <strong key={`${keyPrefix}-${at}`}>{token.slice(2, -2)}</strong>
      : <code key={`${keyPrefix}-${at}`}>{token.slice(1, -1)}</code>)
    start = at + token.length
  }
  if (start < text.length) parts.push(text.slice(start))
  return parts
}

function withBreaks(lines: string[]): ReactNode[] {
  return lines.flatMap((line, i) => i ? [<br key={`br-${i}`} />, ...inline(line, String(i))] : inline(line, String(i)))
}

/** Small, deliberately text-only grammar for exercise descriptions. */
export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      if (i < lines.length) i++
      nodes.push(<pre key={nodes.length}><code data-language={language || undefined}>{code.join('\n')}</code></pre>)
      continue
    }
    const kind = /^- /.test(line) ? 'ul' : /^\d+\. /.test(line) ? 'ol' : null
    if (kind) {
      const items: ReactNode[] = []
      while (i < lines.length && (kind === 'ul' ? /^- /.test(lines[i]) : /^\d+\. /.test(lines[i]))) {
        items.push(<li key={i}>{inline(lines[i].replace(kind === 'ul' ? /^- / : /^\d+\. /, ''))}</li>)
        i++
      }
      nodes.push(kind === 'ul' ? <ul key={nodes.length}>{items}</ul> : <ol key={nodes.length}>{items}</ol>)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^(?:- |\d+\. )/.test(lines[i])) paragraph.push(lines[i++])
    nodes.push(<p key={nodes.length}>{withBreaks(paragraph)}</p>)
  }
  return <div className="ex-markdown">{nodes}</div>
}
