import { Download } from 'lucide-react'
import { linkify } from '../../utils/linkify.jsx'
import { apiUrl } from '../../services/apiClient.js'
import { sanitizeHtml } from '../../utils/sanitizeHtml.js'
import {
  EDITOR_SANITIZE_OPTIONS,
  formatPollDate,
  hasFormattedText,
  mediaWidthPercent,
  parsePostBlocks,
  pollOptionImageUrl,
  pollOptionLabel,
  safeExternalSrc,
  sanitizeEditorHtml,
} from './postEditorUtils.js'

export function renderPostBlocks(post, options = {}) {
  const blocks = parsePostBlocks(post)
  const { onPollVote, onPollClose, pollVoting, pollClosing } = options
  const imageDownloadUrl = (url) => {
    if (!url) return null
    if (url.endsWith('/image')) return apiUrl(`${url}/download`)
    return apiUrl(url.replace(/\/images\/(\d+)$/, '/images/$1/download'))
  }
  const videoDownloadUrl = (url) => (
    url ? apiUrl(url.replace(/\/videos\/(\d+)$/, '/videos/$1/download')) : null
  )
  const attachments = blocks
    .filter((block) => (block.type === 'image' || block.type === 'video' || block.type === 'file') && block.url)
    .map((block) => ({
      key: `${block.type}-${block.url}`,
      name: block.name || (block.type === 'image' ? 'image' : block.type === 'video' ? 'video' : 'attachment.zip'),
      href: block.type === 'image' ? imageDownloadUrl(block.url) : block.type === 'video' ? videoDownloadUrl(block.url) : apiUrl(block.url),
    }))
    .filter((item, index, items) => item.href && items.findIndex((candidate) => candidate.href === item.href) === index)
  const allAttachments = attachments
  const mediaContainerStyle = (width, align) => {
    const base = {
      width: `${mediaWidthPercent(width)}%`,
      maxWidth: '100%',
      userSelect: 'none',
      WebkitUserDrag: 'none',
      textAlign: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
    }
    if (align === 'left') {
      return { ...base, display: 'block', float: 'left', margin: '0.25rem 1rem 0.75rem 0' }
    }
    if (align === 'right') {
      return { ...base, display: 'block', float: 'right', margin: '0.25rem 0 0.75rem 1rem' }
    }
    return { ...base, display: 'block', clear: 'both', margin: '0.75rem auto' }
  }
  return (
    <div className="px-4 py-5 sm:px-5">
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          if (!block.content.trim()) return null
          if (hasFormattedText(block.content)) {
            return (
              <div
                key={i}
                className="community-post-text text-size-container whitespace-pre-wrap break-words auto-text-post"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(sanitizeEditorHtml(block.content), EDITOR_SANITIZE_OPTIONS) }}
              />
            )
          }
          return (
            <div key={i} className="community-post-text text-size-container whitespace-pre-wrap break-words auto-text-post">
              {linkify(block.content)}
            </div>
          )
        }
        if (block.type === 'image') {
          const src = block.url ? apiUrl(block.url) : null
          if (!src) return null
          return (
            <div key={i} className="community-post-media group relative my-2" style={mediaContainerStyle(block.width, block.align)}>
              <img src={src} alt={block.name || '이미지'} draggable={false} className="community-inline-media-image" />
              <a
                href={imageDownloadUrl(block.url)}
                download={block.name}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Download size={12} />
                다운로드
              </a>
            </div>
          )
        }
        if (block.type === 'video') {
          const src = block.url ? apiUrl(block.url) : null
          if (!src) return null
          const downloadUrl = videoDownloadUrl(block.url)
          return (
            <div key={i} className="community-post-media group relative my-2" style={mediaContainerStyle(block.width, block.align)}>
              <video controls preload="metadata" src={src} className="block h-auto w-full rounded" />
              <a
                href={downloadUrl}
                download={block.name}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Download size={12} />
                다운로드
              </a>
            </div>
          )
        }
        if (block.type === 'externalEmbed') {
          const widthStyle = mediaContainerStyle(block.width, block.align)
          if (block.kind === 'youtube') {
            const src = safeExternalSrc(block.embedUrl)
            if (!src) return null
            return (
              <div key={i} className="community-post-media my-2 overflow-hidden rounded border border-[var(--app-hairline)] bg-black/[0.03]" style={widthStyle}>
                <div className="aspect-video w-full bg-black">
                  <iframe
                    src={src}
                    title={block.title || 'YouTube 영상'}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                {block.title && <div className="px-3 py-2 text-xs font-bold text-[var(--theme-body-dark)]">{block.title}</div>}
              </div>
            )
          }
          if (block.kind === 'image') {
            const src = safeExternalSrc(block.url)
            if (!src) return null
            return (
              <div key={i} className="community-post-media my-2" style={widthStyle}>
                <img src={src} alt={block.title || '외부 이미지'} draggable={false} className="community-inline-media-image rounded" />
              </div>
            )
          }
          if (block.kind === 'video') {
            const src = safeExternalSrc(block.url)
            if (!src) return null
            return (
              <div key={i} className="community-post-media my-2" style={widthStyle}>
                <video controls preload="metadata" src={src} className="block h-auto w-full rounded" />
              </div>
            )
          }
        }
        if (block.type === 'poll') {
          const result = (post.pollResults || []).find((item) => item.pollId === block.pollId)
          const counts = result?.optionCounts || []
          const total = counts.reduce((sum, count) => sum + Number(count || 0), 0)
          const closed = Boolean(result?.closed)
          const voted = result?.myOption !== null && result?.myOption !== undefined
          const canClose = Boolean(onPollClose && !closed)
          const status = closed
            ? '종료됨'
            : result?.closesAt
              ? `${formatPollDate(result.closesAt)} 종료`
              : '진행 중'
          return (
            <div key={i} className="my-4 clear-both overflow-hidden rounded-xl border border-[#3b4890]/15 bg-[var(--app-surface)] shadow-[0_14px_36px_rgba(35,48,109,0.12)]">
              <div className="border-b border-[#3b4890]/10 bg-gradient-to-r from-[#3b4890] to-[#5061b5] px-4 py-3 text-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-white/16 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em]">Poll</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-white/78">{status}</span>
                    <span className="text-xs font-bold text-white/78">총 {total.toLocaleString('ko-KR')}표</span>
                    {canClose && (
                      <button
                        type="button"
                        onClick={() => onPollClose(block.pollId)}
                        disabled={pollClosing === block.pollId}
                        className="rounded-full bg-white/16 px-2.5 py-1 text-[11px] font-black text-white transition hover:bg-white/24 disabled:opacity-45"
                      >
                        {pollClosing === block.pollId ? '종료 중' : '투표 종료'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-base font-black leading-6">{block.question}</p>
              </div>
              <div className="space-y-2 p-4">
                {(block.options || []).map((option, index) => {
                  const label = pollOptionLabel(option)
                  const imageUrl = pollOptionImageUrl(option)
                  const count = Number(counts[index] || 0)
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  const selected = result?.myOption === index
                  return (
                    <button
                      key={`${block.pollId}-${label}-${index}`}
                      type="button"
                      onClick={() => onPollVote?.(block.pollId, index)}
                      disabled={!onPollVote || pollVoting === block.pollId || closed || voted}
                      className={`relative w-full overflow-hidden rounded-lg border px-3 py-3 text-left text-sm font-semibold transition ${selected ? 'border-[#3b4890] bg-[#f7f9ff] text-[#23306d] ring-2 ring-[#3b4890]/10' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--theme-body-dark)] hover:border-[#3b4890]/30 hover:bg-[#f8faff]'}`}
                    >
                      <span className="absolute inset-y-0 left-0 bg-[#dce6ff]" style={{ width: `${pct}%` }} />
                      <span className="relative flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${selected ? 'border-[#3b4890] bg-[#3b4890] text-white' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-muted)]'}`}>
                            {index + 1}
                          </span>
                          {imageUrl && (
                            <span className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-white/75">
                              <img src={imageUrl} alt="" className="max-h-14 max-w-20 object-contain" loading="lazy" />
                            </span>
                          )}
                          <span className="min-w-0 break-words">{label}</span>
                        </span>
                        <span className="shrink-0 text-xs font-black text-[#3b4890]">{count.toLocaleString('ko-KR')}표 · {pct}%</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {(closed || voted) && (
                <div className="border-t border-black/5 bg-black/[0.02] px-4 py-2 text-xs font-bold text-[var(--theme-body-muted)]">
                  {closed ? '종료된 투표라 결과만 볼 수 있습니다.' : '이미 투표했습니다. 투표는 변경하거나 취소할 수 없습니다.'}
                </div>
              )}
            </div>
          )
        }
        if (block.type === 'file') return null
        return null
      })}
      <div style={{ clear: 'both' }} />
      {allAttachments.length > 0 && (
        <div className="mt-5 border-t border-[var(--app-hairline)] pt-4">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--theme-body-muted)]">첨부파일</p>
          <div className="flex flex-col gap-2">
            {allAttachments.map((attachment) => (
              <a
                key={attachment.key}
                href={attachment.href}
                download={attachment.name}
                className="inline-flex min-h-10 items-center gap-2 rounded border border-[var(--app-hairline)] bg-black/[0.03] px-3 py-2 text-sm font-semibold text-[#3b4890] transition hover:bg-black/[0.06] hover:underline"
              >
                <Download size={14} />
                <span className="break-all">{attachment.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

