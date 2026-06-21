import { Download } from 'lucide-react'
import { apiUrl } from '../../services/apiClient.js'
import {
  deletedHasFormattedText,
  deletedMediaWidth,
  deletedPollOptionLabel,
  deletedPostBlocks,
  deletedPostIdentity,
  formatDateTime,
  sanitizeDeletedHtml,
} from './deletedCommunityPostUtils.js'

export default function DeletedPostEvidence({ post }) {
  const blocks = deletedPostBlocks(post)
  const usedImageIds = new Set(blocks.filter((block) => block.type === 'image' && block.imageInfo?.id).map((block) => block.imageInfo.id))
  const usedVideoIds = new Set(blocks.filter((block) => block.type === 'video' && block.mediaInfo?.id).map((block) => block.mediaInfo.id))
  const usedFileIds = new Set(blocks.filter((block) => block.type === 'file' && block.mediaInfo?.id).map((block) => block.mediaInfo.id))
  const extraImages = (post.imageInfos || []).filter((image) => !usedImageIds.has(image.id))
  const extraVideos = (post.videoInfos || []).filter((media) => !usedVideoIds.has(media.id))
  const extraFiles = (post.fileInfos || []).filter((media) => !usedFileIds.has(media.id))
  const comments = post.commentInfos || []
  return (
    <div className="space-y-2">
      {blocks.length === 0 && <span className="text-[var(--theme-body-muted)]">-</span>}
      {blocks.map((block, index) => {
        if (block.type === 'image') {
          if (!block.url) return null
          return (
            <figure
              key={`image-${block.imageInfo?.id || index}`}
              className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]"
              style={{ width: `${deletedMediaWidth(block.width)}%`, maxWidth: '100%', marginInline: block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto' }}
            >
              <img src={apiUrl(block.url)} alt={block.name || '삭제 게시글 이미지'} className="block max-h-72 w-full object-contain" />
              {block.name && <figcaption className="border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">{block.name}</figcaption>}
            </figure>
          )
        }
        if (block.type === 'externalImage') {
          return (
            <figure key={`external-${index}`} className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <img src={block.url} alt={block.title || '외부 이미지'} className="block max-h-72 w-full object-contain" />
            </figure>
          )
        }
        if (block.type === 'video') {
          if (!block.url) return null
          return (
            <figure
              key={`video-${block.mediaInfo?.id || index}`}
              className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]"
              style={{ width: `${deletedMediaWidth(block.width)}%`, maxWidth: '100%', marginInline: block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto' }}
            >
              <video src={apiUrl(block.url)} className="block max-h-72 w-full bg-black" controls preload="metadata" />
              {block.name && <figcaption className="border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">{block.name}</figcaption>}
            </figure>
          )
        }
        if (block.type === 'file') {
          if (!block.url) return null
          return (
            <a key={`file-${block.mediaInfo?.id || index}`} href={apiUrl(block.url)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-semibold text-[#3b4890] underline">
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{block.name || '첨부파일'}</span>
            </a>
          )
        }
        if (block.type === 'poll') {
          return (
            <div key={`poll-${index}`} className="rounded-md border border-[#3b4890]/15 bg-[#f7f9ff] px-3 py-2 text-[11px] text-[var(--theme-body-dark)]">
              <strong className="block text-[#3b4890]">투표: {block.question || '투표'}</strong>
              {block.options.length > 0 && <span className="mt-1 block text-[var(--theme-body-muted)]">{block.options.map(deletedPollOptionLabel).filter(Boolean).join(' · ')}</span>}
            </div>
          )
        }
        return (
          <div key={`text-${index}`} className="whitespace-pre-wrap break-words leading-5 text-[var(--theme-body-dark)]">
            {deletedHasFormattedText(block.content) ? (
              <span dangerouslySetInnerHTML={{ __html: sanitizeDeletedHtml(block.content) }} />
            ) : (
              block.content || '-'
            )}
          </div>
        )
      })}
      {extraImages.length > 0 && (
        <div className="grid max-w-[360px] grid-cols-2 gap-2">
          {extraImages.map((image) => (
            <figure key={image.id} className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <img src={apiUrl(image.url)} alt={image.originalName || '삭제 게시글 이미지'} className="block aspect-square w-full object-contain" />
              <figcaption className="truncate border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">
                {image.kind === 'COVER' ? '대표 이미지' : image.originalName || '이미지'}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {extraVideos.length > 0 && (
        <div className="grid max-w-[360px] gap-2">
          {extraVideos.map((media) => (
            <figure key={media.id} className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <video src={apiUrl(media.url)} className="block max-h-72 w-full bg-black" controls preload="metadata" />
              <figcaption className="truncate border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">{media.originalName || '영상'}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {extraFiles.length > 0 && (
        <div className="flex max-w-[360px] flex-wrap gap-2">
          {extraFiles.map((media) => (
            <a key={media.id} href={apiUrl(media.url)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-semibold text-[#3b4890] underline">
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{media.originalName || '첨부파일'}</span>
            </a>
          ))}
        </div>
      )}
      {comments.length > 0 && (
        <div className="max-w-[420px] rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2">
          <strong className="block text-[11px] text-[var(--theme-body-dark)]">댓글 {post.commentCount || comments.length}개 보관됨</strong>
          <div className="mt-2 space-y-1.5">
            {comments.slice(0, 5).map((comment) => (
              <div key={comment.originalCommentId} className="border-t border-black/5 pt-1.5 text-[11px] leading-5">
                <span className="font-semibold text-[var(--theme-body-dark)]">{deletedPostIdentity(comment.authorName, comment.authorStudentId)}</span>
                <span className="ml-2 text-[10px] text-[var(--theme-body-muted)]">{formatDateTime(comment.createdAt)}{comment.edited ? ' · 수정됨' : ''}</span>
                <p className="whitespace-pre-wrap break-words text-[var(--theme-body-muted)]">{comment.content}</p>
              </div>
            ))}
            {comments.length > 5 && <p className="text-[10px] font-semibold text-[var(--theme-body-muted)]">외 {comments.length - 5}개 댓글</p>}
          </div>
        </div>
      )}
    </div>
  )
}
