import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
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
  buildDeletedPostTimeline,
  filterAndSortCommunityPosts,
} from '../utils/communityExperience.js'
import CommentThread from './community/CommentThread.jsx'
import PostEditor from './community/PostEditor.jsx'
import { renderPostBlocks } from './community/PostBlocks.jsx'
import {
  MAX_ANONYMOUS_NAME_LENGTH,
  canAccessAnonymousBoard,
  categoryLabel,
  categoryOptionsForUser,
  textContentForSearch,
} from './community/postEditorUtils.js'

const PAGE_SIZE = 30
const CONCEPT_POST_SCORE_THRESHOLD = 5
const MAX_COMMENT_LENGTH = 1000
function deletedRecordText(value) {
  const raw = String(value || '')
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return textContentForSearch(raw)
    return parsed.map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block.type === 'text') return textContentForSearch(block.content || '')
      if (block.type === 'poll') return `투표: ${block.question || ''}`
      if (block.type === 'externalEmbed') return block.title || block.url || ''
      if (block.type === 'file') return block.name || '첨부파일'
      if (block.type === 'image') return block.name || '이미지'
      if (block.type === 'video') return block.name || '영상'
      return ''
    }).filter(Boolean).join(' · ')
  } catch {
    return textContentForSearch(raw)
  }
}

function deletionIdentity(name, studentId) {
  const safeName = name || '알 수 없음'
  return studentId ? `${safeName}(${studentId})` : safeName
}

const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'comments', label: '댓글 많은 순' },
  { value: 'score', label: '추천순' },
  { value: 'views', label: '조회순' },
]

function boardFilterOptionsForUser(user) {
  return [
    { value: 'ALL', label: '전체글' },
    { value: 'CONCEPT', label: '개념글' },
    ...categoryOptionsForUser(user),
  ]
}

function postScore(post) {
  return (post.upvotes || 0) - (post.downvotes || 0)
}

function isConceptPost(post) {
  return post.conceptPost ?? postScore(post) >= CONCEPT_POST_SCORE_THRESHOLD
}

function isEdited(post) {
  return Boolean(post?.edited)
}

function postImageUrls(post) {
  return [post?.imageUrl, ...(post?.imageUrls || [])]
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function postHasImages(post) {
  return postImageUrls(post).length > 0
}


function paginationRange(currentPage, totalPages) {
  const pages = new Set([1, totalPages])
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1]
    if (index > 0 && page - previous > 1) return [`gap-${previous}-${page}`, page]
    return [page]
  })
}

function shortDate(iso) {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

function clickableCell(open) {
  return {
    onClick: open,
  }
}


function BoardHeader({ title = "COM's 게시판", children }) {
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

function BoardDetailBar({ post, loading, children }) {
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

function BoardComposeBar({ title, children }) {
  return (
    <div className="apple-board-minibar px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--theme-body-muted)]">
          <span className="text-[var(--app-accent-text)]">Community</span>
          <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
          <h1 className="text-xs font-semibold text-[var(--theme-body-muted)]">{title}</h1>
        </div>
        {children && <div className="flex w-full shrink-0 sm:w-auto sm:justify-end">{children}</div>}
      </div>
    </div>
  )
}

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

  const commentCountSuffix = (post) => {
    const count = Number(post?.commentCount || 0)
    return count > 0 ? `[${count.toLocaleString('ko-KR')}]` : ''
  }

  const renderPostTitleWithCount = (post) => {
    const suffix = commentCountSuffix(post)
    return (
      <span className="inline-flex max-w-full min-w-0 items-baseline" title={post.title}>
        <span className="min-w-0 truncate">{post.title}</span>
        {suffix && <span className="shrink-0 text-[0.82em] text-cyan-200">{suffix}</span>}
      </span>
    )
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

  const renderPagination = (placement = 'top') => {
    const disabledClass = 'opacity-35'
    const iconButtonClass = 'flex size-10 items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-muted)] transition enabled:hover:bg-[var(--app-surface-soft)] disabled:pointer-events-none sm:size-9'

    return (
      <div className={`flex flex-col gap-3 ${placement === 'bottom' ? 'items-center' : 'lg:flex-row lg:items-center lg:justify-between'}`}>
        <div className="text-center text-xs font-semibold text-[var(--app-subtle)] lg:text-left">
          {filteredPosts.length > 0
            ? `${showingFrom.toLocaleString('ko-KR')}-${showingTo.toLocaleString('ko-KR')} / ${filteredPosts.length.toLocaleString('ko-KR')}`
            : '0 / 0'}
          <span className="mx-2 text-black/20">|</span>
          {page.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')} 페이지
        </div>
        <div className="max-w-full overflow-x-auto pb-1">
          <div className="flex w-max items-center justify-center gap-1.5 px-1">
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={page === 1}
              className={`hidden sm:flex ${iconButtonClass} ${page === 1 ? disabledClass : ''}`}
              aria-label="첫 페이지"
              title="첫 페이지"
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className={`${iconButtonClass} ${page === 1 ? disabledClass : ''}`}
              aria-label="이전 페이지"
              title="이전 페이지"
            >
              <ChevronLeft size={15} />
            </button>
            {paginationItems.map((item) => (
              typeof item === 'string' ? (
                <span key={item} className="flex size-10 items-center justify-center text-sm font-black text-[var(--app-subtle)] sm:size-9">...</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => goToPage(item)}
                  className={`flex size-10 items-center justify-center rounded-full border text-sm font-black transition sm:size-9 ${
                    page === item
                      ? 'border-[#0071e3] bg-[var(--app-accent)] text-white shadow-[0_8px_22px_rgba(0,113,227,0.22)]'
                      : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-muted)] hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-text)]'
                  }`}
                  aria-current={page === item ? 'page' : undefined}
                >
                  {item}
                </button>
              )
            ))}
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className={`${iconButtonClass} ${page === totalPages ? disabledClass : ''}`}
              aria-label="다음 페이지"
              title="다음 페이지"
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages}
              className={`hidden sm:flex ${iconButtonClass} ${page === totalPages ? disabledClass : ''}`}
              aria-label="마지막 페이지"
              title="마지막 페이지"
            >
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPostCard = (post) => {
    const open = () => openPost(post)
    const concept = isConceptPost(post)

    return (
      <div
        key={post.id}
        tabIndex={0}
        role="button"
        onClick={open}
        onKeyDown={(event) => openRowWithKeyboard(event, open)}
        className={`apple-soft-panel cursor-pointer p-4 text-left text-[var(--app-muted)] transition hover:-translate-y-0.5 focus:bg-[var(--app-surface-soft)] focus:outline-none ${concept ? 'concept-post-card' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
              <span className="text-[var(--app-subtle)]">#{post.id}</span>
              <span className="rounded-full bg-[#e8f8ff] px-2 py-1 text-[var(--app-accent-text)]">{categoryLabel(post.category || 'GENERAL')}</span>
              {concept && <span className="rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] text-[#3a2b00]">개념글</span>}
              {postHasImages(post) && <span className="text-[var(--app-accent-text)]">[사진]</span>}
              {(post.videoInfos?.length > 0) && <span className="text-[var(--app-accent-text)]">[영상]</span>}
              {isEdited(post) && <span className="text-[var(--app-subtle)]">수정</span>}
              {post.authorAdmin && <span className="rounded bg-red-600 px-1 py-0.5 text-[10px] text-white">주딱</span>}
            </div>
            <h3 className="mt-2 min-w-0 text-base font-black leading-6 text-[var(--app-text)]">
              {renderPostTitleWithCount(post)}
            </h3>
          </div>
          {user?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={(event) => handleAdminDeleteFromList(event, post)}
              className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-black text-red-700 transition hover:bg-red-100"
            >
              삭제
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-[var(--app-subtle)]">
          <span className="min-w-0 truncate text-[var(--app-muted)]">{post.authorDisplayName || post.authorName}</span>
          <span className="text-right">{shortDate(post.createdAt)}</span>
          <span>조회 {post.viewCount}</span>
          <span className="text-right">개추 {postScore(post)}</span>
        </div>
      </div>
    )
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
          <>
            <BoardHeader>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button type="button" onClick={openDeletedRecords} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-5 py-3 text-sm sm:w-auto sm:py-2.5">
                  <ShieldAlert size={14} />
                  내 삭제 기록
                </button>
                <button type="button" onClick={() => setMode('write')} className="apple-action-primary w-full px-5 py-3 text-sm sm:w-auto sm:py-2.5">
                  글쓰기
                </button>
              </div>
            </BoardHeader>
            <div className="apple-control-strip px-4 py-4 sm:px-8">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="-mx-1 overflow-x-auto pb-1">
                    <div className="flex min-w-max gap-2 px-1 text-sm font-bold lg:min-w-0 lg:flex-wrap">
                      {boardFilterOptions.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setActiveCategory(item.value)
                            setPage(1)
                          }}
                          className={`apple-chip min-h-10 px-4 py-2 sm:min-h-9 ${
                            effectiveActiveCategory === item.value
                              ? 'apple-chip-active'
                              : ''
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex items-center">
                      <Search size={15} className="pointer-events-none absolute left-3 text-[var(--app-subtle)]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                        placeholder="제목, 본문, 작성자 검색"
                        className="h-11 w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 pl-9 pr-3 text-base text-[var(--app-text)] placeholder:text-[var(--app-subtle)] outline-none transition focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:h-10 sm:w-64 sm:text-sm"
                      />
                    </div>
                    <span className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-center text-xs font-bold text-[var(--app-subtle)]">
                      {filteredPosts.length.toLocaleString('ko-KR')}개
                    </span>
                  </div>
                </div>
                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="flex min-w-max items-center gap-2 px-1 text-xs font-black text-[var(--app-muted)]">
                    <span className="shrink-0">정렬</span>
                    {SORT_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          setSortMode(item.value)
                          setPage(1)
                        }}
                        className={`apple-chip min-h-9 px-3 py-1.5 ${sortMode === item.value ? 'apple-chip-active' : ''}`}
                      >
                        {item.label}
                      </button>
                    ))}
                    {searchQuery.trim() && (
                      <span className="rounded-full border border-[#3b4890]/15 bg-[#f7f9ff] px-3 py-2 text-[#3b4890]">
                        본문까지 검색 중
                      </span>
                    )}
                  </div>
                </div>
                <div className="border-t border-[var(--app-hairline)] pt-4">
                  {renderPagination('top')}
                </div>
              </div>
            </div>
            {error && <p className="mx-5 mt-5 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-7">{error}</p>}
            <div className="m-4 space-y-3 md:hidden">
              {loading && (
                <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">불러오는 중...</div>
              )}
              {!loading && filteredPosts.length === 0 && (
                <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">등록된 글이 없습니다.</div>
              )}
              {visiblePosts.map(renderPostCard)}
            </div>
            <div className="m-5 hidden overflow-x-auto rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] md:block sm:m-8">
              <table className="apple-table w-full min-w-[860px] border-collapse text-sm">
                <thead className="border-b border-[var(--app-hairline)]">
                  <tr>
                    <th className="w-20 px-4 py-3 font-semibold">번호</th>
                    <th className="w-24 px-4 py-3 font-semibold">말머리</th>
                    <th className="px-4 py-3 text-left font-semibold">제목</th>
                    <th className="w-36 px-4 py-3 font-semibold">글쓴이</th>
                    <th className="w-28 px-4 py-3 font-semibold">작성일</th>
                    <th className="w-20 px-4 py-3 font-semibold">조회</th>
                    <th className="w-20 px-4 py-3 font-semibold">개추</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {loading && (
                    <tr><td colSpan="7" className="px-4 py-16 text-center text-[var(--app-muted)]">불러오는 중...</td></tr>
                  )}
                  {!loading && filteredPosts.length === 0 && (
                    <tr><td colSpan="7" className="px-4 py-16 text-center text-[var(--app-muted)]">등록된 글이 없습니다.</td></tr>
                  )}
                  {visiblePosts.map((post) => {
                    const open = () => openPost(post)
                    const concept = isConceptPost(post)
                    return (
                    <tr
                      key={post.id}
                      tabIndex={0}
                      role="button"
                      onClick={open}
                      onKeyDown={(event) => openRowWithKeyboard(event, open)}
                      className={`cursor-pointer text-[var(--app-muted)] transition hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)] focus:outline-none ${concept ? 'concept-post-row' : ''}`}
                    >
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-[var(--app-subtle)]">{post.id}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-bold text-[var(--app-accent-text)]">{categoryLabel(post.category || 'GENERAL')}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                        <span className="flex max-w-full min-w-0 items-center gap-1 text-left font-semibold text-[var(--app-text)] lg:max-w-[520px]">
                          {concept && <span className="shrink-0 rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] font-black text-[#3a2b00]">개념글</span>}
                          {renderPostTitleWithCount(post)}
                        </span>
                        {postHasImages(post) && <span className="ml-1 text-xs text-[var(--app-accent-text)]">[사진]</span>}
                        {(post.videoInfos?.length > 0) && <span className="ml-1 text-xs text-[var(--app-accent-text)]">[영상]</span>}
                        {isEdited(post) && <span className="ml-1 text-[10px] font-bold text-[var(--app-subtle)]">수정</span>}
                        {post.authorAdmin && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-black text-white">주딱</span>}
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-semibold">
                        <span>{post.authorDisplayName || post.authorName}</span>
                        {user?.role === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={(event) => handleAdminDeleteFromList(event, post)}
                            className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700 hover:bg-red-100"
                          >
                            삭제
                          </button>
                        )}
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-[var(--app-subtle)]">{shortDate(post.createdAt)}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{post.viewCount}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{postScore(post)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="apple-control-strip border-t px-5 py-4 sm:px-8">
              {renderPagination('bottom')}
            </div>
          </>
        )}

        {mode === 'deleted' && (
          <>
            <BoardComposeBar title="내 삭제 기록">
              <button type="button" onClick={backToList} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardComposeBar>
            <div className="space-y-3 p-4 sm:p-6">
              <div className="rounded-lg border border-[#3b4890]/15 bg-[#f7f9ff] px-4 py-3 text-sm text-[#3b4890]">
                관리자가 삭제한 글과 직접 삭제한 글의 원문, 사유, 처리자를 여기서 확인할 수 있습니다.
              </div>
              {deletedError && <p className="rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{deletedError}</p>}
              {deletedLoading && <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">삭제 기록을 불러오는 중...</div>}
              {!deletedLoading && deletedPosts.length === 0 && (
                <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">삭제된 내 글이 없습니다.</div>
              )}
              {!deletedLoading && deletedPosts.map((record) => {
                const restored = Boolean(record.restoredPostId)
                const appealed = Boolean(record.latestAppealStatus)
                const timeline = buildDeletedPostTimeline(record)
                return (
                  <article key={record.id} className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]">
                    <div className="border-b border-[var(--app-hairline)] px-4 py-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black text-[#3b4890]">
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
                        <strong className="mb-1 block text-xs text-[#3b4890]">삭제 사유</strong>
                        <p className="whitespace-pre-wrap break-words">{record.deletionReason || '사유 없음'}</p>
                      </div>
                      <div>
                        <strong className="mb-1 block text-xs text-[#3b4890]">원문</strong>
                        <p className="whitespace-pre-wrap break-words">{deletedRecordText(record.content) || '원문 미리보기가 없습니다.'}</p>
                      </div>
                      {record.commentCount > 0 && (
                        <div>
                          <strong className="mb-1 block text-xs text-[#3b4890]">함께 보관된 댓글 {record.commentCount}</strong>
                          <p className="whitespace-pre-wrap break-words text-xs text-[var(--theme-body-muted)]">
                            {(record.commentInfos || []).slice(0, 3).map((comment) => `${comment.authorName || '회원'}: ${comment.content}`).join('\n')}
                          </p>
                        </div>
                      )}
                      {timeline.length > 0 && (
                        <div>
                          <strong className="mb-2 block text-xs text-[#3b4890]">처리 타임라인</strong>
                          <ol className="space-y-2">
                            {timeline.map((item, index) => (
                              <li key={`${record.id}-${item.label}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 text-xs">
                                <span className="mt-1 size-2 rounded-full bg-[#3b4890]" aria-hidden="true" />
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
                            onChange={(event) => setAppealDrafts((prev) => ({ ...prev, [record.id]: event.target.value }))}
                            maxLength={500}
                            rows={3}
                            placeholder="복원이 필요한 이유를 적어주세요."
                            className="w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm"
                          />
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button type="button" onClick={() => submitAppeal(record)} disabled={appealingId === record.id} className="apple-action-primary px-4 py-2 text-sm">
                              {appealingId === record.id ? '보내는 중...' : '요청 보내기'}
                            </button>
                            <button type="button" onClick={() => setAppealOpenId(null)} className="apple-action-secondary px-4 py-2 text-sm">취소</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setAppealOpenId(record.id)} className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm">
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
