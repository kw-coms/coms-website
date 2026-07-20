import { ArrowLeft, RotateCcw } from 'lucide-react'
import { buildDeletedPostTimeline } from '../../utils/communityExperience'
import { categoryLabel } from './postEditorUtils'
import { BoardComposeBar } from './CommunityChrome'
import { deletedRecordText, deletionIdentity } from './communityBoardUtils'
import { Skeleton, SkeletonLine, SkeletonGroup } from '../../components/common/Skeleton'
import ErrorState from '../../components/common/ErrorState'

type DeletedRecord = {
  id: string | number
  title?: string
  content?: string
  category?: string
  commentCount?: number
  commentInfos?: { authorName?: string; content?: string }[]
  deletedAt?: string
  deletedByName?: string
  deletedByStudentId?: string
  deletionReason?: string
  restoredPostId?: string | number
  restoredAt?: string
  latestAppealStatus?: string
  latestAppealMessage?: string
  [key: string]: unknown
}

export default function CommunityDeletedRecordsView({
  deletedError,
  deletedLoading,
  deletedPosts,
  appealOpenId,
  appealDrafts,
  appealingId,
  onBackToList,
  onAppealDraftChange,
  onAppealOpen,
  onAppealCancel,
  onSubmitAppeal,
  onRetry,
}: {
  deletedError?: string
  deletedLoading?: boolean
  deletedPosts: DeletedRecord[]
  appealOpenId: string | number | null
  appealDrafts: Record<string | number, string>
  appealingId: string | number | null
  onBackToList: () => void
  onAppealDraftChange: (id: string | number, value: string) => void
  onAppealOpen: (id: string | number) => void
  onAppealCancel: () => void
  onSubmitAppeal: (record: DeletedRecord) => void
  onRetry?: () => void
}) {
  return (
    <>
      <BoardComposeBar title="내 삭제 기록">
        <button type="button" onClick={onBackToList} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
          <ArrowLeft size={14} />
          목록
        </button>
      </BoardComposeBar>
      <div className="space-y-3 p-4 sm:p-6">
        <div className="rounded-lg border border-[var(--app-accent-border)]/15 bg-[#f7f9ff] px-4 py-3 text-sm text-[var(--app-accent-text)]">
          관리자가 삭제한 글과 직접 삭제한 글의 원문, 사유, 처리자를 여기서 확인할 수 있습니다.
        </div>
        {!deletedLoading && deletedError && (
          <ErrorState message={deletedError} onRetry={onRetry} />
        )}
        {deletedLoading && (
          <SkeletonGroup>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4 space-y-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded" />
                  </div>
                  <SkeletonLine className="w-2/3" />
                  <SkeletonLine className="w-1/3" />
                </div>
              ))}
            </div>
          </SkeletonGroup>
        )}
        {!deletedLoading && !deletedError && deletedPosts.length === 0 && (
          <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">삭제된 내 글이 없습니다.</div>
        )}
        {!deletedLoading && !deletedError && deletedPosts.map((record) => {
          const restored = Boolean(record.restoredPostId)
          const appealed = Boolean(record.latestAppealStatus)
          const timeline = buildDeletedPostTimeline(record)
          return (
            <article key={record.id} className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <div className="border-b border-[var(--app-hairline)] px-4 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black text-[var(--app-accent-text)]">
                  <span>{categoryLabel(record.category || 'GENERAL')}</span>
                  <span className={restored ? 'rounded bg-emerald-100 px-2 py-1 text-emerald-700' : 'rounded bg-red-50 px-2 py-1 text-red-700'}>
                    {restored ? '복원됨' : '삭제됨'}
                  </span>
                  {appealed && <span className="rounded bg-[#fff4cc] px-2 py-1 text-[#8a6400]">복원 요청 접수됨</span>}
                </div>
                <h2 className="break-words text-lg font-black text-[var(--app-text)]">{record.title}</h2>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--theme-body-muted)]">
                  <span>삭제 {record.deletedAt ? new Date(record.deletedAt).toLocaleString('ko-KR') : '-'}</span>
                  <span>처리자 {deletionIdentity(record.deletedByName, record.deletedByStudentId)}</span>
                  {record.restoredAt && <span>복원 {new Date(record.restoredAt).toLocaleString('ko-KR')}</span>}
                </div>
              </div>
              <div className="space-y-3 px-4 py-4 text-sm text-[#424245]">
                <div>
                  <strong className="mb-1 block text-xs text-[var(--app-accent-text)]">삭제 사유</strong>
                  <p className="whitespace-pre-wrap break-words">{record.deletionReason || '사유 없음'}</p>
                </div>
                <div>
                  <strong className="mb-1 block text-xs text-[var(--app-accent-text)]">원문</strong>
                  <p className="whitespace-pre-wrap break-words">{deletedRecordText(record.content) || '원문 미리보기가 없습니다.'}</p>
                </div>
                {record.commentCount > 0 && (
                  <div>
                    <strong className="mb-1 block text-xs text-[var(--app-accent-text)]">함께 보관된 댓글 {record.commentCount}</strong>
                    <p className="whitespace-pre-wrap break-words text-xs text-[var(--theme-body-muted)]">
                      {(record.commentInfos || []).slice(0, 3).map((comment) => `${comment.authorName || '회원'}: ${comment.content}`).join('\n')}
                    </p>
                  </div>
                )}
                {timeline.length > 0 && (
                  <div>
                    <strong className="mb-2 block text-xs text-[var(--app-accent-text)]">처리 타임라인</strong>
                    <ol className="space-y-2">
                      {timeline.map((item, index) => (
                        <li key={`${record.id}-${item.label}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 text-xs">
                          <span className="mt-1 size-2 rounded-full bg-[var(--app-brand)]" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="font-black text-[var(--app-text)]">{item.label}</span>
                            {item.time && <span className="ml-2 text-[var(--theme-body-muted)]">{item.time}</span>}
                            {item.detail && (
                              <span className="block break-words text-[var(--theme-body-muted)]">
                                {item.label === '삭제됨' ? '처리자는 상단 기록에 표시됩니다.' : item.detail}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {restored ? (
                  <a href={`/community/${record.restoredPostId}`} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                    <RotateCcw size={14} />
                    복원된 글 열기
                  </a>
                ) : appealed ? (
                  <p className="rounded-lg border border-[#f0c36d]/40 bg-[#fff9e8] px-3 py-2 text-xs font-bold text-[#8a6400]">복원 요청 접수됨: {record.latestAppealMessage}</p>
                ) : appealOpenId === record.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={appealDrafts[record.id] || ''}
                      onChange={(event) => onAppealDraftChange(record.id, event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="복원이 필요한 이유를 적어주세요."
                      className="w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => onSubmitAppeal(record)} disabled={appealingId === record.id} className="apple-action-primary px-4 py-2 text-sm">
                        {appealingId === record.id ? '보내는 중...' : '요청 보내기'}
                      </button>
                      <button type="button" onClick={onAppealCancel} className="apple-action-secondary px-4 py-2 text-sm">취소</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => onAppealOpen(record.id)} className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm">
                    <RotateCcw size={14} />
                    복원 요청
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
