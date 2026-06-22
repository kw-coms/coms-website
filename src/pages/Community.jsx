import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import {
  createComment,
  closeCommunityPoll,
  appealDeletedCommunityPost,
  deleteComment,
  deleteCommunityPost,
  getCommunityPost,
  listMyDeletedCommunityPosts,
  listComments,
  listCommunityPosts,
  updateComment,
  voteCommunityPost,
  voteCommunityPoll,
} from '../services/communityApi.js'
import { useAuth } from '../contexts/useAuth.js'
import {
  filterAndSortCommunityPosts,
} from '../utils/communityExperience.js'
import CommentThread from './community/CommentThread.jsx'
import CommunityDeletedRecordsView from './community/CommunityDeletedRecordsView.jsx'
import CommunityListView from './community/CommunityListView.jsx'
import { BoardComposeBar, BoardDetailBar } from './community/CommunityChrome.jsx'
import PostEditor from './community/PostEditor.jsx'
import { renderPostBlocks } from './community/PostBlocks.jsx'
import {
  MAX_ANONYMOUS_NAME_LENGTH,
  canAccessAnonymousBoard,
  categoryLabel,
} from './community/postEditorUtils.js'
import {
  PAGE_SIZE,
  boardFilterOptionsForUser,
  isConceptPost,
  isEdited,
  paginationRange,
  postScore,
} from './community/communityBoardUtils.js'

const MAX_COMMENT_LENGTH = 1000

export default function Community({ onBack }) {
  const { user } = useAuth()
  const { id: urlId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [posts, setPosts] = useState([])
  const [deletedPosts, setDeletedPosts] = useState([])
  const [currentPost, setCurrentPost] = useState(null)
  const [mode, setMode] = useState('list')
  const [loading, setLoading] = useState(true)
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletedError, setDeletedError] = useState('')
  const [page, setPage] = useState(1)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [sortMode, setSortMode] = useState('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [comments, setComments] = useState([])
  const [commentInput, setCommentInput] = useState('')
  const [commentAnonymousName, setCommentAnonymousName] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [replyInput, setReplyInput] = useState('')
  const [replyAnonymousName, setReplyAnonymousName] = useState('')
  const [replyMentionEnabled, setReplyMentionEnabled] = useState(true)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentInput, setEditCommentInput] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
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

  useEffect(() => {
    let mounted = true
    listCommunityPosts()
      .then((data) => { if (mounted) setPosts(data) })
      .catch((err) => { if (mounted) setError(err.message || '커뮤니티 글을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

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

  const bumpCurrentPostCommentCount = (delta) => {
    if (!currentPost || delta === 0) return
    const postId = currentPost.id
    setCurrentPost((prev) => {
      if (!prev) return prev
      return { ...prev, commentCount: Math.max(0, Number(prev.commentCount || 0) + delta) }
    })
    setPosts((prev) => prev.map((post) => (
      post.id === postId ? { ...post, commentCount: Math.max(0, Number(post.commentCount || 0) + delta) } : post
    )))
  }

  const replyMentionFor = (comment) => {
    const name = comment?.authorName?.trim()
    return name ? `@${name}` : ''
  }

  const buildReplyContent = (parentId) => {
    const body = replyInput.trim()
    if (!body) return ''
    const parent = comments.find((comment) => comment.id === parentId)
    const mention = replyMentionEnabled ? replyMentionFor(parent) : ''
    const content = mention ? `${mention} ${body}` : body
    if (content.length > MAX_COMMENT_LENGTH) {
      alert(`태그를 포함한 답글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해주세요.`)
      return ''
    }
    return content
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
      setComments([])
      setCommentInput('')
      setCommentAnonymousName('')
      setReplyTo(null)
      setReplyInput('')
      setReplyAnonymousName('')
      setReplyMentionEnabled(true)
      setEditingCommentId(null)
      setEditCommentInput('')
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    const numId = Number(urlId)
    if (isNaN(numId)) { navigate('/community', { replace: true }); return }
    setDetailLoading(true)
    setComments([])
    setCommentInput('')
    setCommentAnonymousName('')
    setReplyTo(null)
    setReplyInput('')
    setReplyAnonymousName('')
    setReplyMentionEnabled(true)
    setEditingCommentId(null)
    setEditCommentInput('')
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

  const handleAddComment = async () => {
    if (!commentInput.trim() || !currentPost) return
    setCommentSaving(true)
    try {
      const comment = await createComment(currentPost.id, commentInput.trim(), null, isAnonymousDetail ? commentAnonymousName.trim() : '')
      setComments((prev) => [...prev, comment])
      bumpCurrentPostCommentCount(1)
      setCommentInput('')
    } catch (err) {
      alert(err.message || '댓글 등록 실패')
    } finally {
      setCommentSaving(false)
    }
  }

  const handleAddReply = async (parentId) => {
    if (!replyInput.trim() || !currentPost) return
    setCommentSaving(true)
    try {
      const content = buildReplyContent(parentId)
      if (!content) return
      const comment = await createComment(currentPost.id, content, parentId, isAnonymousDetail ? replyAnonymousName.trim() : '')
      setComments((prev) => [...prev, comment])
      bumpCurrentPostCommentCount(1)
      setReplyInput('')
      setReplyAnonymousName('')
      setReplyTo(null)
      setReplyMentionEnabled(true)
    } catch (err) {
      alert(err.message || '답글 등록 실패')
    } finally {
      setCommentSaving(false)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!currentPost || !window.confirm('댓글을 삭제하시겠습니까?')) return
    try {
      await deleteComment(currentPost.id, commentId)
      const toDelete = new Set([commentId])
      let changed = true
      while (changed) {
        changed = false
        comments.forEach((comment) => {
          if (comment.parentCommentId && toDelete.has(comment.parentCommentId) && !toDelete.has(comment.id)) {
            toDelete.add(comment.id)
            changed = true
          }
        })
      }
      setComments((prev) => {
        let changed = true
        while (changed) {
          changed = false
          prev.forEach((comment) => {
            if (comment.parentCommentId && toDelete.has(comment.parentCommentId) && !toDelete.has(comment.id)) {
              toDelete.add(comment.id)
              changed = true
            }
          })
        }
        return prev.filter((comment) => !toDelete.has(comment.id))
      })
      bumpCurrentPostCommentCount(-toDelete.size)
    } catch (err) {
      alert(err.message || '댓글 삭제 실패')
    }
  }

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id)
    setEditCommentInput(comment.content || '')
    setReplyTo(null)
    setReplyInput('')
  }

  const handleUpdateComment = async (commentId) => {
    if (!currentPost || !editCommentInput.trim()) return
    setCommentSaving(true)
    try {
      const updated = await updateComment(currentPost.id, commentId, editCommentInput.trim())
      setComments((prev) => prev.map((comment) => (comment.id === commentId ? updated : comment)))
      setEditingCommentId(null)
      setEditCommentInput('')
    } catch (err) {
      alert(err.message || '댓글 수정 실패')
    } finally {
      setCommentSaving(false)
    }
  }

  const backToList = () => {
    setMode('list')
    setCurrentPost(null)
    setComments([])
    setCommentInput('')
    setReplyTo(null)
    setReplyInput('')
    setReplyMentionEnabled(true)
    setEditingCommentId(null)
    setEditCommentInput('')
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

  const currentPostConcept = currentPost ? isConceptPost(currentPost) : false
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
          <>
            <BoardDetailBar post={currentPost} loading={detailLoading}>
              <button type="button" onClick={backToList} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardDetailBar>
            {detailLoading || !currentPost ? (
              <p className="px-4 py-16 text-center text-sm text-[var(--theme-body-muted)]">글을 여는 중...</p>
            ) : (
              <article className="m-0 overflow-hidden bg-[var(--app-surface)] sm:m-5 sm:rounded-lg sm:border sm:border-[var(--app-hairline)]">
                <div className="border-b border-[var(--app-hairline)] px-4 py-4 sm:px-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black text-[#3b4890]">
                    <span>{categoryLabel(currentPost.category || 'GENERAL')}</span>
                    {currentPostConcept && <span className="rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] font-black text-[#3a2b00]">개념글</span>}
                  </div>
                  <h2 className="break-words text-xl font-black leading-8 sm:text-2xl">{currentPost.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--theme-body-muted)]">
                    <span className="font-bold text-[var(--theme-body-mid)]">{currentPost.authorDisplayName || currentPost.authorName}</span>
                    {currentPost.authorAdmin && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">주딱</span>}
                    {currentPost.concept && <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-black">개념글</span>}
                    <span>{new Date(currentPost.createdAt).toLocaleString('ko-KR')}</span>
                    {isEdited(currentPost) && <span>수정 {new Date(currentPost.updatedAt).toLocaleString('ko-KR')}</span>}
                    <span>조회 {currentPost.viewCount}</span>
                    <span>개추 {postScore(currentPost)}</span>
                  </div>
                </div>
                <div className="min-h-[220px] sm:min-h-[280px]">
                  {renderPostBlocks(currentPost, {
                    onPollVote: handlePollVote,
                    onPollClose: currentPost?.editable ? handlePollClose : null,
                    pollVoting,
                    pollClosing,
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2 border-y border-[var(--app-hairline)] bg-[#fafafa] px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3 sm:py-5">
                  <button type="button" onClick={() => handleVote(1)} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-black sm:px-5 ${currentPost.myVote === 1 ? 'border-[#0071e3] bg-[var(--app-accent)] text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'}`}>
                    <ThumbsUp size={16} />
                    개추 {currentPost.upvotes}
                  </button>
                  <button type="button" onClick={() => handleVote(-1)} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-black sm:px-5 ${currentPost.myVote === -1 ? 'border-red-600 bg-red-600 text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-red-600'}`}>
                    <ThumbsDown size={16} />
                    비추 {currentPost.downvotes}
                  </button>
                </div>
                <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-between">
                  <button type="button" onClick={backToList} className="min-h-11 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
                    목록
                  </button>
                  {currentPost.editable && (
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <button type="button" onClick={() => setMode('edit')} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
                        <Pencil size={14} />
                        수정
                      </button>
                      <button type="button" onClick={() => handleDelete(currentPost)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 sm:min-h-0">
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                <CommentThread
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
                  maxAnonymousNameLength={MAX_ANONYMOUS_NAME_LENGTH}
                  replyMentionFor={replyMentionFor}
                  onAddComment={handleAddComment}
                  onAddReply={handleAddReply}
                  onUpdateComment={handleUpdateComment}
                  onDeleteComment={handleDeleteComment}
                  onStartEditComment={startEditComment}
                />
              </article>
            )}
          </>
        )}
      </section>
    </div>
  )
}
