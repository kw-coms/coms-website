import { useState } from 'react'
import {
  createComment,
  deleteComment,
  updateComment,
} from '../../services/communityApi'
import { showToast } from '../../components/common/Toast'

export const MAX_COMMENT_LENGTH = 1000

type CommentablePost = { id: number; commentCount?: number; [key: string]: unknown }

export function useCommunityComments({
  currentPost,
  isAnonymousDetail,
  setCurrentPost,
  setPosts,
}: {
  currentPost: CommentablePost | null
  isAnonymousDetail: boolean
  setCurrentPost: (updater: (prev: CommentablePost | null) => CommentablePost | null) => void
  setPosts: (updater: (prev: CommentablePost[]) => CommentablePost[]) => void
}) {
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

  const resetCommentSession = () => {
    setComments([])
    setCommentInput('')
    setCommentAnonymousName('')
    setReplyTo(null)
    setReplyInput('')
    setReplyAnonymousName('')
    setReplyMentionEnabled(true)
    setEditingCommentId(null)
    setEditCommentInput('')
  }

  const resetCommentNavigation = () => {
    setComments([])
    setCommentInput('')
    setReplyTo(null)
    setReplyInput('')
    setReplyMentionEnabled(true)
    setEditingCommentId(null)
    setEditCommentInput('')
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
      showToast({ message: `태그를 포함한 답글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해주세요.`, tone: 'error' })
      return ''
    }
    return content
  }

  const handleAddComment = async () => {
    if (!commentInput.trim() || !currentPost) return
    setCommentSaving(true)
    try {
      const comment = await createComment(currentPost.id, commentInput.trim(), null, isAnonymousDetail ? commentAnonymousName.trim() : '')
      setComments((prev) => [...prev, comment])
      bumpCurrentPostCommentCount(1)
      setCommentInput('')
      showToast({ message: '댓글을 등록했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '댓글 등록 실패', tone: 'error' })
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
      showToast({ message: '답글을 등록했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '답글 등록 실패', tone: 'error' })
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
      showToast({ message: '댓글을 삭제했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '댓글 삭제 실패', tone: 'error' })
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
      showToast({ message: '댓글을 수정했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '댓글 수정 실패', tone: 'error' })
    } finally {
      setCommentSaving(false)
    }
  }

  return {
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
  }
}
