import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  createCommunityPost,
  deleteCommunityPost,
  deletePostFile,
  deletePostImage,
  deletePostVideo,
  fetchLinkPreview,
  searchYoutubeVideos,
  updateCommunityPost,
  uploadPostFile,
  uploadPostImages,
  uploadPostVideo,
} from '../../services/communityApi'
import RichBodyEditor from '../../components/richEditor/RichBodyEditor'
import { FULL_RICH_FEATURES } from '../../components/richEditor/richBodyFeatures'
import {
  EMPTY_POST_STAND_IN,
  MAX_ANONYMOUS_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  categoryOptionsForPost,
  categoryOptionsForUser,
  creationStandIn,
  needsUpload,
  optimizeImageFile,
  parsePostBlocks,
  removedSavedMedia,
  serializePostBlocks,
  textContentForSearch,
} from './postEditorUtils'
import { usePermissions } from '../../contexts/usePermissions'
import DraftNotice, { DraftConflictNotice } from '../../components/common/DraftNotice'
import { confirmEditorLeave, useEditorDraft } from '../../hooks/useEditorDraft'
import { draftIsStale, draftStorageKey, readDraft } from '../../utils/editorDraft'

type PostEditorProps = {
  initialPost?: { id?: number; title?: string; category?: string; anonymousName?: string; imageUrl?: string; [key: string]: unknown } | null
  onCancel: () => void
  onSave: (saved: unknown) => void
  user?: { role?: string; [key: string]: unknown } | null
}

export default function PostEditor(props: PostEditorProps) {
  const owner = props.user?.studentId
  if (typeof owner !== 'string' || !owner) return null
  return <PostEditorForm key={owner} {...props} />
}

function PostEditorForm({ initialPost, onCancel, onSave, user }: PostEditorProps) {
  const isEditing = Boolean(initialPost)
  const { permissions } = usePermissions()
  // A draft saved earlier for this same target (new post, or editing post N) is restored once.
  const storageKey = draftStorageKey(typeof user?.studentId === 'string' ? user.studentId : null, 'post', initialPost?.id)
  const [stored] = useState(() => readDraft(storageKey))
  // A draft older than the post's last server change is offered, never applied on its own.
  const conflict = Boolean(stored) && isEditing && draftIsStale(stored, typeof initialPost?.updatedAt === 'string' ? initialPost.updatedAt : null)
  const [restored, setRestored] = useState(conflict ? null : stored)
  const [pendingDraft, setPendingDraft] = useState(conflict ? stored : null)
  const [title, setTitle] = useState(restored?.title ?? (initialPost?.title || ''))
  const [category, setCategory] = useState(restored?.category || initialPost?.category || 'GENERAL')
  const [anonymousName, setAnonymousName] = useState(restored?.anonymousName ?? (initialPost?.anonymousName || ''))
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState('')
  const [error, setError] = useState('')
  const editorApiRef = useRef(null)
  // A new post that exists on the server but is not complete yet: its media upload failed
  // part-way. Kept so the next attempt finishes this post instead of creating another one.
  const [pendingPost, setPendingPost] = useState<{ id: number; category: string } | null>(null)
  const savedBlocks = () => (isEditing ? parsePostBlocks(initialPost) : [])
  const [initialBlocks, setInitialBlocks] = useState(() => (
    restored ? parsePostBlocks({ ...(initialPost || {}), content: restored.content }) : savedBlocks()
  ))
  // What the editor held when the post was opened: the draft only counts as unsaved changes
  // when it differs from this.
  const [originalBlocks] = useState(savedBlocks)
  const postedCategory = isEditing ? (initialPost?.category || 'GENERAL') : pendingPost?.category
  const categoryOptions = useMemo(
    () => categoryOptionsForPost(categoryOptionsForUser(user, permissions), postedCategory),
    [user, permissions, postedCategory],
  )
  const effectiveCategory = categoryOptions.some((item) => item.value === category)
    ? category
    : (categoryOptions[0]?.value || 'GENERAL')

  const draft = useEditorDraft({
    storageKey,
    baseline: () => ({
      title: initialPost?.title || '',
      category: categoryOptions.some((item) => item.value === (initialPost?.category || 'GENERAL')) ? (initialPost?.category || 'GENERAL') : (categoryOptions[0]?.value || 'GENERAL'),
      anonymousName: initialPost?.anonymousName || '',
      content: isEditing ? serializePostBlocks(originalBlocks) : '',
    }),
    current: () => {
      const blocks = editorApiRef.current?.getBlocks()
      return { title, category: effectiveCategory, anonymousName, content: serializePostBlocks(blocks ?? initialBlocks) }
    },
    hasPending: () => (editorApiRef.current?.getBlocks() || []).some(needsUpload),
    paused: Boolean(pendingDraft),
  })

  const applyDraft = (picked) => {
    setTitle(picked.title)
    setCategory(picked.category || initialPost?.category || 'GENERAL')
    setAnonymousName(picked.anonymousName)
    setInitialBlocks(parsePostBlocks({ ...(initialPost || {}), content: picked.content }))
    setEditorKey((key) => key + 1)
    setRestored(picked)
    setPendingDraft(null)
  }
  const keepCurrent = () => {
    draft.reset()
    setPendingDraft(null)
  }

  const discardDraft = () => {
    draft.reset()
    setRestored(null)
    setTitle(initialPost?.title || '')
    setCategory(initialPost?.category || 'GENERAL')
    setAnonymousName(initialPost?.anonymousName || '')
    setInitialBlocks(savedBlocks())
    setEditorKey((key) => key + 1)
  }

  const cancel = async () => {
    if (!(await confirmEditorLeave())) return
    // Nothing was meant to be published: take back the half-made post rather than leave it on
    // the board with a stand-in body.
    if (pendingPost && !saving) {
      setSaving(true)
      setSavingStep('작성 취소 중...')
      try {
        await deleteCommunityPost(pendingPost.id)
      } catch {
        // Left for the author to remove from the board; cancelling must still work.
      } finally {
        setSaving(false)
        setSavingStep('')
      }
    }
    onCancel()
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    const blocks = editorApiRef.current?.getBlocks() || []
    const hasContent = blocks.some(b => (b.type === 'text' && textContentForSearch(b.content).trim()) || b.type === 'image' || b.type === 'video' || b.type === 'file' || b.type === 'externalEmbed' || b.type === 'poll')
    if (!hasContent) { setError('내용을 입력하거나 사진/영상/첨부파일을 추가해주세요.'); return }

    setSaving(true)
    setError('')
    try {
      const fields = { title: title.trim(), category: effectiveCategory, anonymousName: anonymousName.trim() }
      let postId = isEditing ? initialPost.id : pendingPost?.id
      if (!postId && !blocks.some(needsUpload)) {
        // Nothing to upload, so the post is created whole in one request: no stand-in body, no
        // follow-up save for the server to mistake for an edit.
        setSavingStep('글 등록 중...')
        const created = await createCommunityPost({ ...fields, content: serializePostBlocks(blocks) })
        draft.clear()
        onSave(created)
        return
      }
      if (!postId) {
        // Uploads need the post's id, so the post is created with a stand-in body (its first
        // paragraph) and completed below.
        setSavingStep('글 등록 중...')
        const standIn = creationStandIn(blocks)
        let created
        try {
          created = await createCommunityPost({ ...fields, content: standIn })
        } catch (err) {
          // A plain-text body is screened more strictly than the same words inside a block. If
          // the stand-in is what was refused, the neutral one still lets the post through.
          if (standIn === EMPTY_POST_STAND_IN || err?.status !== 400) throw err
          created = await createCommunityPost({ ...fields, content: EMPTY_POST_STAND_IN })
        }
        postId = created.id
        setPendingPost({ id: created.id, category: effectiveCategory })
      }

      const uploadedBlocks = []
      for (const block of blocks) {
        if (block.type === 'text') {
          uploadedBlocks.push(block)
        } else if (needsUpload(block)) {
          setSavingStep(`업로드 중: ${block.name}`)
          if (block.type === 'image') {
            setSavingStep(`이미지 최적화 중: ${block.name}`)
            const uploadFile = await optimizeImageFile(block.file)
            const ids = await uploadPostImages(postId, [uploadFile])
            if (!Array.isArray(ids) || !ids[0]) throw new Error(`${block.name} 이미지 업로드 응답이 올바르지 않습니다.`)
            editorApiRef.current?.updateFigureMeta(block.id, { status: 'saved', mediaId: ids[0] })
            uploadedBlocks.push({ ...block, status: 'saved', mediaId: ids[0], name: uploadFile.name })
          } else if (block.type === 'video') {
            const videoId = await uploadPostVideo(postId, block.file)
            if (!videoId) throw new Error(`${block.name} 영상 업로드 응답이 올바르지 않습니다.`)
            editorApiRef.current?.updateFigureMeta(block.id, { status: 'saved', mediaId: videoId })
            uploadedBlocks.push({ ...block, status: 'saved', mediaId: videoId })
          } else if (block.type === 'file') {
            const fileId = await uploadPostFile(postId, block.file)
            if (!fileId) throw new Error(`${block.name} 첨부파일 업로드 응답이 올바르지 않습니다.`)
            editorApiRef.current?.updateFigureMeta(block.id, { status: 'saved', fileId })
            uploadedBlocks.push({ ...block, status: 'saved', fileId })
          }
        } else {
          uploadedBlocks.push(block)
        }
      }

      const removeLegacyImage = Boolean(initialPost?.imageUrl && !uploadedBlocks.some(b => b.legacy))
      setSavingStep('저장 중...')
      const saved = await updateCommunityPost(postId, { ...fields, content: serializePostBlocks(uploadedBlocks), removeImage: removeLegacyImage })
      setPendingPost(null)
      if (isEditing) {
        // The saved body no longer refers to these uploads; free them (and their share of the
        // per-post limit). Best effort: the post itself is already saved correctly.
        const deleteById = { image: deletePostImage, video: deletePostVideo, file: deletePostFile }
        await Promise.allSettled(
          removedSavedMedia(initialBlocks, uploadedBlocks).map((media) => deleteById[media.type](postId, media.id)),
        )
      }
      draft.clear()
      onSave(saved)
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
      setSavingStep('')
    }
  }

  return (
    <>
      {pendingDraft && <DraftConflictNotice savedAt={pendingDraft.savedAt} updatedAt={typeof initialPost?.updatedAt === 'string' ? initialPost.updatedAt : null} onApply={() => applyDraft(pendingDraft)} onKeep={keepCurrent} className="mx-4 mt-4 sm:mx-5" />}
      {draft.saveFailed && <p role="alert" className="mx-4 mt-4 text-xs font-semibold text-red-500 sm:mx-5">임시 저장하지 못했어요. 저장 공간이 부족하거나 막혀 있습니다. 이 페이지를 떠나면 작성한 내용이 사라질 수 있어요.</p>}
      {restored && <DraftNotice onDiscard={discardDraft} className="mx-4 mt-4 sm:mx-5" />}
    <form onSubmit={submit} className="community-compose-form min-w-0">
      <fieldset className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start" disabled={Boolean(pendingDraft)} inert={Boolean(pendingDraft)}>
      <div className="community-compose-meta order-2 flex flex-wrap gap-2 lg:col-start-2 lg:row-start-1">
        <select value={effectiveCategory} onChange={(e) => setCategory(e.target.value)}
          aria-label="게시판 분류"
          className="w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24"
        >
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE_LENGTH}
        placeholder="제목"
        aria-label="제목"
        className="community-compose-title order-1 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-1 lg:row-start-1"
      />

      {effectiveCategory === 'ANONYMOUS' && (
        <input
          value={anonymousName}
          onChange={(e) => setAnonymousName(e.target.value)}
          maxLength={MAX_ANONYMOUS_NAME_LENGTH}
          placeholder="ㅇㅇ"
          aria-label="익명 이름"
          className="community-compose-anonymous order-3 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-2 lg:row-start-2"
        />
      )}

      <div className="order-4 lg:col-start-1 lg:row-start-2 lg:row-span-5">
        <RichBodyEditor
          key={editorKey}
          initialBlocks={initialBlocks}
          apiRef={editorApiRef}
          features={FULL_RICH_FEATURES}
          onError={(msg) => setError(msg)}
          searchYoutube={searchYoutubeVideos}
          fetchLinkPreview={fetchLinkPreview}
        />
      </div>

      {error && <p role="alert" className="community-compose-error order-5 text-sm font-semibold text-red-500 lg:col-start-2">{error}</p>}
      {pendingPost && !saving && (
        <p className="order-5 text-xs font-semibold text-[var(--app-muted)] lg:col-start-2">
          첨부 업로드가 끝나지 않았습니다. &lsquo;글 등록&rsquo;을 다시 누르면 이어서 올리고, 취소하면 등록을 되돌립니다.
        </p>
      )}

      <div className="community-compose-actions order-6 flex flex-col gap-2 sm:flex-row lg:col-start-2 lg:flex-col">
        <button type="submit" disabled={saving || !title.trim()}
          className="apple-action-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50 sm:min-h-0"
        >
          {saving ? (savingStep || '저장 중...') : isEditing ? '수정 완료' : '글 등록'}
        </button>
        <button type="button" onClick={cancel} disabled={saving}
          className="apple-action-secondary inline-flex min-h-11 items-center justify-center gap-1 px-4 py-2.5 text-sm disabled:opacity-50 sm:min-h-0"
        >
          <X size={14} />취소
        </button>
      </div>
      </fieldset>
    </form>
    </>
  )
}
