import { Download, ThumbsUp, Trash2 } from 'lucide-react'
import { downloadUrl } from '../../services/archiveApi'
import { renderRichBody } from '../richEditor/renderRichBody'
import { categoryLabel, formatDate, formatSize } from './archiveUtils'

export function ArchiveDetailView({
  detailFile,
  isAdmin,
  voting,
  onVote,
  onDelete,
}: {
  detailFile: any
  isAdmin: boolean
  voting: boolean
  onVote: () => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="m-5 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-5 text-[var(--app-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:m-7 sm:p-7">
      <div className="border-b border-[var(--app-hairline)] pb-5">
        <p className="apple-eyebrow">Archive</p>
        <h2 className="mt-3 break-words text-2xl font-bold text-[var(--app-text)]">{detailFile.title || detailFile.originalName}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--app-subtle)]">
          <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 font-bold text-[var(--app-accent-text)]">{categoryLabel(detailFile.category || 'GENERAL')}</span>
          <span>{detailFile.uploaderName || detailFile.uploadedBy || '-'} · {formatDate(detailFile.uploadedAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-subtle)]">
          <span>조회 {detailFile.viewCount ?? 0}</span>
          <span>개추 {detailFile.upvotes ?? 0}</span>
        </div>
      </div>
      {detailFile.description && (
        <div className="border-b border-[var(--app-hairline)] py-5 text-sm leading-7 text-[var(--app-muted)]">
          {renderRichBody(
            detailFile.description,
            (plain) => <p className="whitespace-pre-wrap">{plain}</p>,
          )}
        </div>
      )}
      <dl className="grid gap-4 border-b border-[var(--app-hairline)] py-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--app-subtle)]">파일명</dt>
          <dd className="mt-1 break-all font-bold text-[var(--app-text)]">{detailFile.originalName}</dd>
        </div>
        <div>
          <dt className="font-bold text-[var(--app-subtle)]">크기</dt>
          <dd className="mt-1 font-bold text-[var(--app-text)]">{formatSize(detailFile.fileSize)}</dd>
        </div>
      </dl>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a
          href={downloadUrl(detailFile.id)}
          className="apple-action-primary inline-flex min-h-12 items-center justify-center gap-2 px-4 text-sm max-md:col-span-2 sm:min-h-10"
        >
          <Download size={15} />
          다운로드
        </a>
        <button
          type="button"
          onClick={onVote}
          disabled={voting}
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold disabled:opacity-50 sm:min-h-10 ${detailFile.myVote === 1 ? 'border-[#0071e3] bg-[var(--app-accent)] text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'}`}
        >
          <ThumbsUp size={15} />
          개추 {detailFile.upvotes ?? 0}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onDelete(detailFile.id)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 transition hover:bg-red-100 sm:min-h-10"
          >
            <Trash2 size={15} />
            삭제
          </button>
        )}
      </div>
    </div>
  )
}
