import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Award, ThumbsUp, MessageSquare, FileText } from 'lucide-react'
import { getMemberReputation, listPostsByAuthor } from '../../services/communityApi'
import { queryKeys } from '../../services/queryKeys'
import { BoardComposeBar } from './CommunityChrome'
import CommunityPostRow from './CommunityPostRow'
import { useBookmarkMutation } from './useBookmarkMutation'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'

export default function CommunityMemberProfile({ onBack }: { onBack: () => void }) {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const bookmarkMutation = useBookmarkMutation()

  const reputationQuery = useQuery({
    queryKey: queryKeys.community.reputation(studentId),
    queryFn: () => getMemberReputation(studentId),
    enabled: Boolean(studentId),
  })

  const postsQuery = useQuery({
    queryKey: queryKeys.community.byAuthor(studentId),
    queryFn: async () => {
      const result = await listPostsByAuthor(studentId)
      return Array.isArray(result) ? result : []
    },
    enabled: Boolean(studentId),
  })

  const reputation = reputationQuery.data
  const posts = postsQuery.data ?? []
  const breakdown = reputation?.breakdown ?? {}
  // The author's display name comes from their posts when available.
  const memberName = posts[0]?.authorDisplayName || posts[0]?.authorName || reputation?.name || studentId

  const openPost = (post) => navigate(`/community/${post.id}`)
  const handleToggleBookmark = (post) => {
    if (bookmarkMutation.isPending) return
    bookmarkMutation.mutate(post)
  }

  const statItems = [
    { icon: FileText, label: '작성글', value: breakdown.posts ?? 0 },
    { icon: MessageSquare, label: '댓글', value: breakdown.comments ?? 0 },
    { icon: ThumbsUp, label: '받은 개추', value: breakdown.upvotes ?? 0 },
  ]

  return (
    <div className="min-w-0 space-y-4">
      <div data-reveal className="flex justify-center sm:justify-start">
        <button type="button" onClick={onBack} className="apple-action-secondary w-full px-4 py-2.5 text-sm sm:w-auto">
          커뮤니티로 돌아가기
        </button>
      </div>

      <section data-reveal className="apple-board-shell">
        <BoardComposeBar title="회원 프로필">
          <button type="button" onClick={onBack} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
            <ArrowLeft size={14} />
            목록
          </button>
        </BoardComposeBar>

        <div className="apple-board-hero px-4 py-6 sm:px-8 sm:py-8">
          <p className="apple-eyebrow">Member</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="apple-display break-words text-3xl sm:text-4xl">{memberName}</h1>
            {reputation && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] px-3 py-1.5 text-sm font-black text-[var(--app-accent-text)]">
                <Award size={15} />
                {reputation.tierLabel}
                <span className="rounded-full bg-[var(--app-surface)] px-2 py-0.5 text-xs font-black text-[var(--app-text)]">
                  {(reputation.score ?? 0).toLocaleString('ko-KR')}점
                </span>
              </span>
            )}
          </div>

          {reputationQuery.isError && (
            <p className="apple-copy mt-3 text-sm text-[var(--app-muted)]">평판 정보를 불러오지 못했습니다.</p>
          )}

          {reputation && (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
              {statItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-3 text-center">
                  <item.icon size={16} className="mx-auto text-[var(--app-subtle)]" />
                  <p className="mt-1.5 text-lg font-black text-[var(--app-text)]">{Number(item.value).toLocaleString('ko-KR')}</p>
                  <p className="text-[11px] font-semibold text-[var(--app-subtle)]">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--app-hairline)] px-4 pt-5 sm:px-8">
          <h2 className="text-sm font-black text-[var(--app-text)]">작성한 글</h2>
        </div>

        {postsQuery.isError && (
          <p className="mx-4 mt-4 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-8">
            {postsQuery.error?.message || '작성한 글을 불러오지 못했습니다.'}
          </p>
        )}

        <div className="m-4 space-y-3 sm:m-8">
          {postsQuery.isPending && (
            <SkeletonGroup label="작성한 글을 불러오는 중">
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </SkeletonGroup>
          )}
          {!postsQuery.isPending && !postsQuery.isError && posts.length === 0 && (
            <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">작성한 글이 없습니다.</div>
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
