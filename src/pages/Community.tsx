import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
} from 'lucide-react'
import {
  closeCommunityPoll,
  appealDeletedCommunityPost,
  deleteCommunityPost,
  getCommunityPost,
  listMyDeletedCommunityPosts,
  listComments,
  voteCommunityPost,
  voteCommunityPoll,
} from '../services/communityApi'
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

export default function Community({ onBack }: any) {
  const { user } = useAuth()
  const { id: urlId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { posts, setPosts, loading, error } = useCommunityPosts()
  const [deletedPosts, setDeletedPosts] = useState([])
  const [currentPost, setCurrentPost] = useState(null)
  const [mode, setMode] = useState('list')
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deletedError, setDeletedError] = useState('')
  const [page, setPage] = useState(1)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [sortMode, setSortMode] = useState('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [pollVoting, setPollVoting] = useState('')
  const [pollClosing, setPollClosing] = useState('')
  const [appealOpenId, setAppealOpenId] = useState(null)
  const [appealDrafts, setAppealDrafts] = useState({})
  const [appealingId, setAppealingId] = useState(null)
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
  const pageStartIndex = (page - 1) * PAGE_SIZE
  const visiblePosts = useMemo(
    () => filteredPosts.slice(pageStartIndex, pageStartIndex + PAGE_SIZE),
    [filteredPosts, pageStartIndex],
  )
  const paginationItems = useMemo(() => paginationRange(page, totalPages), [page, totalPages])
  const showingFrom = filteredPosts.length === 0 ? 0 : pageStartIndex + 1
  const showingTo = Math.min(filteredPosts.length, pageStartIndex + visiblePosts.length)

  useEffect(() => {
    if (page > totalPages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPage(totalPages)
    }
  }, [page, totalPages])

  const mergePost = (post) => {
    setPosts((prev) => {
      const exists = prev.some((item) => item.id === post.id)
      if (!exists) return [post, ...prev]
      return prev.map((item) => (item.id === post.id ? { ...item, ...post } : item))
    })
    setCurrentPost(post)
  }

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
  }, [mode])

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
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    const reason = user?.role === 'ADMIN'
      ? window.prompt('삭제 사유를 입력하세요. 감사 로그에 기록됩니다.', '')
      : ''
    if (reason === null) return
    if (user?.role === 'ADMIN' && post.authorStudentId !== user.studentId && !reason.trim()) {
      alert('관리자가 다른 회원의 글을 삭제하려면 삭제 사유가 필요합니다.')
      return
    }
    try {
      await deleteCommunityPost(post.id, reason)
      setPosts((prev) => prev.filter((item) => item.id !== post.id))
      backToList()
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
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
      alert('복원 요청 사유를 입력해주세요.')
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
      alert(err.message || '복원 요청을 보내지 못했습니다.')
    } finally {
      setAppealingId(null)
    }
  }

  const handleVote = async (value) => {
    if (!currentPost) return
    try {
      const updated = await voteCommunityPost(currentPost.id, value)
      mergePost(updated)
    } catch (err) {
      alert(err.message || '투표 처리 중 오류가 발생했습니다.')
    }
  }

  const handlePollVote = async (pollId, optionIndex) => {
    if (!currentPost) return
    setPollVoting(pollId)
    try {
      const updated = await voteCommunityPoll(currentPost.id, pollId, optionIndex)
      mergePost(updated)
    } catch (err) {
      alert(err.message || '투표 처리 중 오류가 발생했습니다.')
    } finally {
      setPollVoting('')
    }
  }

  const handlePollClose = async (pollId) => {
    if (!currentPost || !window.confirm('투표를 종료하시겠습니까? 종료 후에는 다시 투표할 수 없습니다.')) return
    setPollClosing(pollId)
    try {
      const updated = await closeCommunityPoll(currentPost.id, pollId)
      mergePost(updated)
    } catch (err) {
      alert(err.message || '투표 종료 중 오류가 발생했습니다.')
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
        <div className="flex justify-center sm:justify-start">
          <button type="button" onClick={onBack} className="apple-action-secondary w-full px-4 py-2.5 text-sm sm:w-auto">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="apple-board-shell">
        {mode === 'list' && (
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
          />
        )}
      </section>
    </div>
  )
}
