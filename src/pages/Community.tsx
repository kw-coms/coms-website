import { useEffect, useMemo, useState } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
} from 'lucide-react'
import {
  updateCommunityPostAuthor,
  closeCommunityPoll,
  appealDeletedCommunityPost,
  deleteCommunityPost,
  getCommunityPost,
  listMyDeletedCommunityPosts,
  listComments,
  pinCommunityPost,
  reportCommunityPost,
  voteCommunityPost,
  voteCommunityPoll,
} from '../services/communityApi'
import { showToast } from '../components/common/Toast'
import { confirmDialog, promptDialog } from '../components/common/ConfirmDialog'
import { Skeleton, SkeletonLine, SkeletonGroup } from '../components/common/Skeleton'
import ErrorState from '../components/common/ErrorState'
import { useAuth } from '../contexts/useAuth'
import {
  filterAndSortCommunityPosts,
} from '../utils/communityExperience'
import CommunityDetailView from './community/CommunityDetailView'
import CommunityDeletedRecordsView from './community/CommunityDeletedRecordsView'
import CommunityListView from './community/CommunityListView'
import { BoardComposeBar } from './community/CommunityChrome'
import PostEditor from './community/PostEditor'
import {
  canAccessAnonymousBoard,
} from './community/postEditorUtils'
import {
  PAGE_SIZE,
  boardFilterOptionsForUser,
  paginationRange,
} from './community/communityBoardUtils'
import { MAX_COMMENT_LENGTH, useCommunityComments } from './community/useCommunityComments'
import { useCommunityPosts } from './community/useCommunityPosts'
import { useBookmarkMutation } from './community/useBookmarkMutation'
import { canManageSensitiveAdmin, canModerateCommunity } from '../utils/roleAccess'

export default function Community({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const { id: urlId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { posts, setPosts, refreshPosts, loading, error } = useCommunityPosts()
  const [deletedPosts, setDeletedPosts] = useState([])
  const [currentPost, setCurrentPost] = useState(null)
  const [mode, setMode] = useState('list')
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deletedError, setDeletedError] = useState('')
  // `rawPage` is what the user last asked for; the page actually rendered is
  // derived below, clamped to the current filter's page count.
  const [rawPage, setPage] = useState(1)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [sortMode, setSortMode] = useState('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [pollVoting, setPollVoting] = useState('')
  const [pollClosing, setPollClosing] = useState('')
  const [appealOpenId, setAppealOpenId] = useState(null)
  const [appealDrafts, setAppealDrafts] = useState({})
  const [appealingId, setAppealingId] = useState(null)
  useScrollReveal([posts?.length, loading])
  const boardFilterOptions = useMemo(() => boardFilterOptionsForUser(user), [user])
  const canSeeAnonymous = canAccessAnonymousBoard(user)
  const effectiveActiveCategory = boardFilterOptions.some((item) => item.value === activeCategory) ? activeCategory : 'ALL'
  const isAnonymousDetail = currentPost?.category === 'ANONYMOUS'
  const deletedViewRequested = useMemo(() => new URLSearchParams(location.search).get('view') === 'deleted', [location.search])
  const {
    comments,
    setComments,
    commentInput,
    setCommentInput,
    commentAnonymousName,
    setCommentAnonymousName,
    replyTo,
    setReplyTo,
    replyInput,
    setReplyInput,
    replyAnonymousName,
    setReplyAnonymousName,
    replyMentionEnabled,
    setReplyMentionEnabled,
    editingCommentId,
    setEditingCommentId,
    editCommentInput,
    setEditCommentInput,
    commentSaving,
    resetCommentSession,
    resetCommentNavigation,
    replyMentionFor,
    handleAddComment,
    handleAddReply,
    handleDeleteComment,
    startEditComment,
    handleUpdateComment,
  } = useCommunityComments({
    currentPost,
    isAnonymousDetail,
    setCurrentPost,
    setPosts,
  })

  const filteredPosts = useMemo(
    () => filterAndSortCommunityPosts(posts, {
      category: effectiveActiveCategory,
      query: searchQuery,
      sort: sortMode,
      canSeeAnonymous,
    }),
    [canSeeAnonymous, effectiveActiveCategory, posts, searchQuery, sortMode],
  )
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE))
  // Derived, not corrected in an effect: when a filter/search shrinks the result
  // set below the current page, clamping during render shows the right page on the
  // FIRST paint. The old setState-in-effect rendered one empty page first.
  const page = Math.min(rawPage, totalPages)
  const pageStartIndex = (page - 1) * PAGE_SIZE
  const visiblePosts = useMemo(
    () => filteredPosts.slice(pageStartIndex, pageStartIndex + PAGE_SIZE),
    [filteredPosts, pageStartIndex],
  )
  const paginationItems = useMemo(() => paginationRange(page, totalPages), [page, totalPages])
  const showingFrom = filteredPosts.length === 0 ? 0 : pageStartIndex + 1
  const showingTo = Math.min(filteredPosts.length, pageStartIndex + visiblePosts.length)

  const bookmarkMutation = useBookmarkMutation({
    onToggled: (postId, bookmarked) => {
      setCurrentPost((prev) => (prev && prev.id === postId ? { ...prev, bookmarked } : prev))
    },
  })
  const handleToggleBookmark = (post) => {
    if (!post || bookmarkMutation.isPending) return
    bookmarkMutation.mutate(post)
  }

  const mergePost = (post) => {
    setPosts((prev) => {
      const exists = prev.some((item) => item.id === post.id)
      if (!exists) return [post, ...prev]
      return prev.map((item) => (item.id === post.id ? { ...item, ...post } : item))
    })
    setCurrentPost(post)
  }

  const [deletedReloadToken, setDeletedReloadToken] = useState(0)
  const retryDeletedPosts = () => setDeletedReloadToken((token) => token + 1)

  useEffect(() => {
    if (mode !== 'deleted') return undefined
    let mounted = true
    Promise.resolve()
      .then(() => {
        if (!mounted) return []
        setDeletedLoading(true)
        setDeletedError('')
        return listMyDeletedCommunityPosts()
      })
      .then((data) => { if (mounted) setDeletedPosts(Array.isArray(data) ? data : []) })
      .catch((err) => { if (mounted) setDeletedError(err.message || '삭제 기록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setDeletedLoading(false) })
    return () => { mounted = false }
  }, [mode, deletedReloadToken])

  useEffect(() => {
    if (!urlId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMode(deletedViewRequested ? 'deleted' : 'list')
      setCurrentPost(null)
      resetCommentSession()
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    const numId = Number(urlId)
    if (isNaN(numId)) { navigate('/community', { replace: true }); return }
    setDetailLoading(true)
    resetCommentSession()
    let mounted = true
    Promise.all([
      getCommunityPost(numId),
      listComments(numId).catch(() => []),
    ])
      .then(([detail, commentList]) => {
        if (!mounted) return
        mergePost(detail)
        setComments(Array.isArray(commentList) ? commentList : [])
        setMode('detail')
        window.setTimeout(() => {
          const targetId = window.location.hash?.slice(1)
          if (targetId) document.getElementById(targetId)?.scrollIntoView({ block: 'center' })
        }, 60)
      })
      .catch(() => { if (mounted) navigate('/community', { replace: true }) })
      .finally(() => { if (mounted) setDetailLoading(false) })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, deletedViewRequested])

  const openPost = (post) => {
    navigate('/community/' + post.id)
  }

  const backToList = () => {
    setMode('list')
    setCurrentPost(null)
    resetCommentNavigation()
    if (urlId) navigate('/community')
    else if (deletedViewRequested) navigate('/community', { replace: true })
  }

  const handleSave = (saved) => {
    mergePost(saved)
    setMode('detail')
    navigate('/community/' + saved.id)
  }

  const handleDelete = async (post) => {
    if (!(await confirmDialog({ message: '게시글을 삭제하시겠습니까?', tone: 'danger' }))) return
    const reason = canModerateCommunity(user?.role)
      ? await promptDialog({ message: '삭제 사유를 입력하세요. 감사 로그에 기록됩니다.', defaultValue: '' })
      : ''
    if (reason === null) return
    if (canModerateCommunity(user?.role) && post.authorStudentId !== user.studentId && !reason.trim()) {
      showToast({ message: '관리자가 다른 회원의 글을 삭제하려면 삭제 사유가 필요합니다.', tone: 'error' })
      return
    }
    try {
      await deleteCommunityPost(post.id, reason)
      setPosts((prev) => prev.filter((item) => item.id !== post.id))
      backToList()
    } catch (err) {
      showToast({ message: err.message || '삭제 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const handleAdminDeleteFromList = async (event, post) => {
    event.stopPropagation()
    await handleDelete(post)
  }

  const openDeletedRecords = () => {
    setMode('deleted')
    navigate('/community?view=deleted')
  }

  const submitAppeal = async (record) => {
    const message = (appealDrafts[record.id] || '').trim()
    if (!message) {
      showToast({ message: '복원 요청 사유를 입력해주세요.', tone: 'error' })
      return
    }
    setAppealingId(record.id)
    try {
      const appeal = await appealDeletedCommunityPost(record.id, message)
      setDeletedPosts((prev) => prev.map((item) => (
        item.id === record.id
          ? {
              ...item,
              latestAppealStatus: appeal.status,
              latestAppealMessage: appeal.message,
              latestAppealCreatedAt: appeal.createdAt,
              latestAppealRequesterStudentId: appeal.requesterStudentId,
              latestAppealRequesterName: appeal.requesterName,
            }
          : item
      )))
      setAppealOpenId(null)
      setAppealDrafts((prev) => ({ ...prev, [record.id]: '' }))
    } catch (err) {
      showToast({ message: err.message || '복원 요청을 보내지 못했습니다.', tone: 'error' })
    } finally {
      setAppealingId(null)
    }
  }

  // 신고는 로그인한 회원만, 자기 글은 제외. 익명 글은 authorStudentId가 서버에서
  // 마스킹되어(CommunityService: `maskAnonymous ? null : …`) 작성자 판별이 불가능한데,
  // 익명 게시판이야말로 신고가 필요한 곳이라 coms-member-app과 동일하게 노출한다.
  const canReportCurrentPost = Boolean(
    user?.studentId && currentPost && currentPost.authorStudentId !== user.studentId,
  )

  const handleReport = async (reason, detail) => {
    await reportCommunityPost(currentPost.id, reason, detail)
    showToast({ message: '신고가 접수되었습니다. 운영진이 확인합니다.', tone: 'success' })
  }

  const handleVote = async (value) => {
    if (!currentPost) return
    try {
      const updated = await voteCommunityPost(currentPost.id, value)
      mergePost(updated)
    } catch (err) {
      showToast({ message: err.message || '투표 처리 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const [pinning, setPinning] = useState(false)
  const handleAuthorUpdate = async (payload) => {
    const updated = await updateCommunityPostAuthor(currentPost.id, payload)
    setCurrentPost(updated)
    setPosts((prev) => prev.map((post) => (post.id === updated.id ? { ...post, ...updated } : post)))
    showToast({ message: '작성자가 변경되었습니다.' })
  }

  const handlePin = async () => {
    if (!currentPost || pinning) return
    setPinning(true)
    const nextPinned = !currentPost.pinned
    try {
      const updated = await pinCommunityPost(currentPost.id, nextPinned)
      mergePost(updated)
      showToast({ message: nextPinned ? '게시글을 고정했습니다.' : '고정을 해제했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '고정 처리 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setPinning(false)
    }
  }

  const handlePollVote = async (pollId, optionIndex) => {
    if (!currentPost) return
    setPollVoting(pollId)
    try {
      const updated = await voteCommunityPoll(currentPost.id, pollId, optionIndex)
      mergePost(updated)
    } catch (err) {
      showToast({ message: err.message || '투표 처리 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setPollVoting('')
    }
  }

  const handlePollClose = async (pollId) => {
    if (!currentPost || !(await confirmDialog({ message: '투표를 종료하시겠습니까? 종료 후에는 다시 투표할 수 없습니다.', tone: 'danger' }))) return
    setPollClosing(pollId)
    try {
      const updated = await closeCommunityPoll(currentPost.id, pollId)
      mergePost(updated)
    } catch (err) {
      showToast({ message: err.message || '투표 종료 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setPollClosing('')
    }
  }

  const goToPage = (nextPage) => {
    setPage(Math.min(Math.max(nextPage, 1), totalPages))
  }

  const openWrite = () => setMode('write')
  const handleCategoryChange = (value) => {
    setActiveCategory(value)
    setPage(1)
  }
  const handleSearchChange = (value) => {
    setSearchQuery(value)
    setPage(1)
  }
  const handleSortChange = (value) => {
    setSortMode(value)
    setPage(1)
  }
  const handleAppealDraftChange = (recordId, value) => {
    setAppealDrafts((prev) => ({ ...prev, [recordId]: value }))
  }

  return (
    <div className="min-w-0 space-y-4">
      {mode === 'list' && (
        <div data-reveal className="flex justify-center sm:justify-start">
          <button type="button" onClick={onBack} className="apple-action-secondary w-full px-4 py-2.5 text-sm sm:w-auto">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section data-reveal className="apple-board-shell">
        {mode === 'list' && loading && posts.length === 0 && (
          <SkeletonGroup>
            <div className="space-y-0">
              {/* Skeleton header bar */}
              <div className="flex items-center justify-between border-b border-[var(--app-hairline)] px-5 py-4 sm:px-8">
                <Skeleton className="h-5 w-24 rounded-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24 rounded-full" />
                  <Skeleton className="h-9 w-16 rounded-full" />
                </div>
              </div>
              {/* Skeleton control strip */}
              <div className="border-b border-[var(--app-hairline)] px-5 py-4 sm:px-8">
                <div className="flex flex-wrap gap-2">
                  {[72, 56, 80, 64, 96, 56].map((w, i) => (
                    <Skeleton key={i} className="h-9 rounded-full" style={{ width: w }} />
                  ))}
                </div>
              </div>
              {/* Skeleton post rows — mobile cards */}
              <div className="m-4 space-y-3 md:hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="apple-soft-panel p-4 space-y-3">
                    <div className="flex gap-2">
                      <SkeletonLine className="w-8" />
                      <SkeletonLine className="w-16 rounded-full" />
                    </div>
                    <SkeletonLine className="w-3/4" />
                    <div className="grid grid-cols-2 gap-2">
                      <SkeletonLine className="w-20" />
                      <SkeletonLine className="w-14 ml-auto" />
                      <SkeletonLine className="w-16" />
                      <SkeletonLine className="w-12 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Skeleton post rows — desktop table */}
              <div className="m-5 hidden overflow-x-auto rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] md:block sm:m-8">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead className="border-b border-[var(--app-hairline)]">
                    <tr>
                      {['번호', '말머리', '제목', '글쓴이', '작성일', '조회', '개추'].map((col) => (
                        <th key={col} className="px-4 py-3 font-semibold text-[var(--app-muted)]">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-4 text-center"><SkeletonLine className="w-8 mx-auto" /></td>
                        <td className="px-4 py-4 text-center"><SkeletonLine className="w-14 mx-auto rounded-full" /></td>
                        <td className="px-4 py-4"><SkeletonLine className="w-2/3" /></td>
                        <td className="px-4 py-4 text-center"><SkeletonLine className="w-16 mx-auto" /></td>
                        <td className="px-4 py-4 text-center"><SkeletonLine className="w-16 mx-auto" /></td>
                        <td className="px-4 py-4 text-center"><SkeletonLine className="w-8 mx-auto" /></td>
                        <td className="px-4 py-4 text-center"><SkeletonLine className="w-8 mx-auto" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SkeletonGroup>
        )}

        {/* Gate the full-view error on posts.length (nothing loaded), not filteredPosts.length —
            otherwise a search that simply matched nothing unmounts the list along with its own
            search box, trapping the user with no way to clear the term. */}
        {mode === 'list' && !loading && Boolean(error) && posts.length === 0 && (
          <ErrorState className="m-4 sm:m-8" message={error} onRetry={refreshPosts} />
        )}

        {mode === 'list' && !(loading && posts.length === 0) && !(!loading && Boolean(error) && posts.length === 0) && (
          <CommunityListView
            onOpenDeletedRecords={openDeletedRecords}
            onWrite={openWrite}
            boardFilterOptions={boardFilterOptions}
            effectiveActiveCategory={effectiveActiveCategory}
            onCategoryChange={handleCategoryChange}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            filteredPosts={filteredPosts}
            visiblePosts={visiblePosts}
            loading={loading}
            error={error}
            sortMode={sortMode}
            onSortChange={handleSortChange}
            page={page}
            totalPages={totalPages}
            paginationItems={paginationItems}
            showingFrom={showingFrom}
            showingTo={showingTo}
            onPageChange={goToPage}
            user={user}
            onOpenPost={openPost}
            onAdminDelete={handleAdminDeleteFromList}
            onOpenBookmarks={() => navigate('/community/bookmarks')}
            onToggleBookmark={handleToggleBookmark}
            bookmarkPending={bookmarkMutation.isPending}
          />
        )}

        {mode === 'deleted' && (
          <CommunityDeletedRecordsView
            deletedError={deletedError}
            deletedLoading={deletedLoading}
            deletedPosts={deletedPosts}
            appealOpenId={appealOpenId}
            appealDrafts={appealDrafts}
            appealingId={appealingId}
            onBackToList={backToList}
            onAppealDraftChange={handleAppealDraftChange}
            onAppealOpen={setAppealOpenId}
            onAppealCancel={() => setAppealOpenId(null)}
            onSubmitAppeal={submitAppeal}
            onRetry={retryDeletedPosts}
          />
        )}

        {mode === 'write' && (
          <>
            <BoardComposeBar title="글쓰기">
              <button type="button" onClick={backToList} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardComposeBar>
            <div className="p-0 sm:p-5">
              <PostEditor user={user} onCancel={backToList} onSave={handleSave} />
            </div>
          </>
        )}

        {mode === 'edit' && currentPost && (
          <>
            <BoardComposeBar title="글 수정">
              <button type="button" onClick={() => setMode('detail')} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                본문
              </button>
            </BoardComposeBar>
            <div className="p-0 sm:p-5">
              <PostEditor user={user} initialPost={currentPost} onCancel={() => setMode('detail')} onSave={handleSave} />
            </div>
          </>
        )}

        {mode === 'detail' && (
          <CommunityDetailView
            currentPost={currentPost}
            detailLoading={detailLoading}
            comments={comments}
            commentInput={commentInput}
            setCommentInput={setCommentInput}
            commentAnonymousName={commentAnonymousName}
            setCommentAnonymousName={setCommentAnonymousName}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            replyInput={replyInput}
            setReplyInput={setReplyInput}
            replyAnonymousName={replyAnonymousName}
            setReplyAnonymousName={setReplyAnonymousName}
            replyMentionEnabled={replyMentionEnabled}
            setReplyMentionEnabled={setReplyMentionEnabled}
            editingCommentId={editingCommentId}
            setEditingCommentId={setEditingCommentId}
            editCommentInput={editCommentInput}
            setEditCommentInput={setEditCommentInput}
            commentSaving={commentSaving}
            isAnonymousDetail={isAnonymousDetail}
            maxCommentLength={MAX_COMMENT_LENGTH}
            replyMentionFor={replyMentionFor}
            onAddComment={handleAddComment}
            onAddReply={handleAddReply}
            onUpdateComment={handleUpdateComment}
            onDeleteComment={handleDeleteComment}
            onStartEditComment={startEditComment}
            pollVoting={pollVoting}
            pollClosing={pollClosing}
            onPollVote={handlePollVote}
            onPollClose={handlePollClose}
            onVote={handleVote}
            onBackToList={backToList}
            onEdit={() => setMode('edit')}
            onDelete={handleDelete}
            isAdmin={canModerateCommunity(user?.role)}
            isPresident={canManageSensitiveAdmin(user?.role)}
            onUpdateAuthor={handleAuthorUpdate}
            pinning={pinning}
            onPin={handlePin}
            onToggleBookmark={handleToggleBookmark}
            bookmarkPending={bookmarkMutation.isPending}
            canReport={canReportCurrentPost}
            onReport={handleReport}
          />
        )}
      </section>
    </div>
  )
}
