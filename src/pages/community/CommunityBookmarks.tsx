import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Bookmark } from 'lucide-react'
import { listBookmarkedPosts } from '../../services/communityApi'
import { queryKeys } from '../../services/queryKeys'
import { BoardComposeBar } from './CommunityChrome'
import CommunityPostRow from './CommunityPostRow'
import { useBookmarkMutation } from './useBookmarkMutation'

export default function CommunityBookmarks({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const bookmarkMutation = useBookmarkMutation()

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.community.bookmarks(),
    queryFn: async () => {
      const result = await listBookmarkedPosts()
      return Array.isArray(result) ? result : []
    },
  })
  const posts = data ?? []

  const openPost = (post) => navigate(`/community/${post.id}`)
  const handleToggleBookmark = (post) => {
    if (bookmarkMutation.isPending) return
    bookmarkMutation.mutate(post)
  }

  return (
    <div className="min-w-0 space-y-4">
      <div data-reveal className="flex justify-center sm:justify-start">
        <button type="button" onClick={onBack} className="apple-action-secondary w-full px-4 py-2.5 text-sm sm:w-auto">
          커뮤니티로 돌아가기
        </button>
      </div>

      <section data-reveal className="apple-board-shell">
        <BoardComposeBar title="내 스크랩">
          <button type="button" onClick={onBack} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
            <ArrowLeft size={14} />
            목록
          </button>
        </BoardComposeBar>

        <div className="apple-board-hero px-4 py-6 sm:px-8 sm:py-8">
          <p className="apple-eyebrow">Bookmarks</p>
          <h1 className="apple-display mt-2 flex items-center gap-3 break-words text-3xl sm:text-4xl">
            <Bookmark size={26} className="text-[var(--app-accent-text)]" />
            내 스크랩
          </h1>
          <p className="apple-copy mt-3 max-w-2xl text-sm sm:text-base">스크랩한 글을 한곳에서 모아봅니다.</p>
        </div>

        {error && (
          <p className="mx-4 mt-4 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-8">
            {error?.message || '스크랩한 글을 불러오지 못했습니다.'}
          </p>
        )}

        <div className="m-4 space-y-3 sm:m-8">
          {isPending && (
            <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">불러오는 중...</div>
          )}
          {!isPending && !error && posts.length === 0 && (
            <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">스크랩한 글이 없습니다.</div>
          )}
          {posts.map((post) => (
            <CommunityPostRow
              key={post.id}
              post={post}
              onOpen={openPost}
              onToggleBookmark={handleToggleBookmark}
              bookmarkPending={bookmarkMutation.isPending}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
