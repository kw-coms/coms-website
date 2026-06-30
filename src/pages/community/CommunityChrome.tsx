import { categoryLabel } from './postEditorUtils'
import { shortDate } from './communityBoardUtils'

export function BoardHeader({ title = "COM's 게시판", children }: {
  title?: string
  children?: React.ReactNode
}) {
  return (
    <div className="apple-board-hero px-4 py-7 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="apple-eyebrow">Community</p>
          <h1 className="apple-display mt-3 break-words text-4xl sm:text-6xl">{title}</h1>
          <p className="apple-copy mt-4 max-w-2xl text-base sm:text-lg">스터디 기록, 질문, 프로젝트 공유를 말머리별로 빠르게 확인합니다.</p>
        </div>
        {children && <div className="flex w-full shrink-0 sm:w-auto sm:justify-end">{children}</div>}
      </div>
    </div>
  )
}

export function BoardDetailBar({ post, loading, children }: {
  post?: { category?: string; createdAt?: string } | null
  loading?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="apple-board-minibar px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--theme-body-muted)]">
          <span className="text-[var(--app-accent-text)]">Community</span>
          <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
          <span>{loading ? '글 여는 중...' : post ? categoryLabel(post.category || 'GENERAL') : '게시글'}</span>
          {post?.createdAt && (
            <>
              <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
              <span>{shortDate(post.createdAt)}</span>
            </>
          )}
        </div>
        {children && <div className="flex w-full shrink-0 sm:w-auto sm:justify-end">{children}</div>}
      </div>
    </div>
  )
}

export function BoardComposeBar({ title, children }: {
  title?: string
  children?: React.ReactNode
}) {
  return (
    <div className="apple-board-minibar px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--theme-body-muted)]">
          <span className="text-[var(--app-accent-text)]">Community</span>
          <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
          <h2 className="text-xs font-semibold text-[var(--theme-body-muted)]">{title}</h2>
        </div>
        {children && <div className="flex w-full shrink-0 sm:w-auto sm:justify-end">{children}</div>}
      </div>
    </div>
  )
}
