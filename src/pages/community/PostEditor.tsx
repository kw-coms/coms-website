import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  createCommunityPost,
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
  MAX_ANONYMOUS_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  categoryOptionsForUser,
  optimizeImageFile,
  parsePostBlocks,
  textContentForSearch,
} from './postEditorUtils'

export default function PostEditor({ initialPost, onCancel, onSave, user }: any) {
  const isEditing = Boolean(initialPost)
  const [title, setTitle] = useState(initialPost?.title || '')
  const [category, setCategory] = useState(initialPost?.category || 'GENERAL')
  const [anonymousName, setAnonymousName] = useState(initialPost?.anonymousName || '')
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState('')
  const [error, setError] = useState('')
  const editorApiRef = useRef(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialBlocks = useMemo(() => isEditing ? parsePostBlocks(initialPost) : [], [])
  const categoryOptions = useMemo(() => categoryOptionsForUser(user), [user])
  const effectiveCategory = categoryOptions.some((item) => item.value === category) ? category : 'GENERAL'

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    const blocks = editorApiRef.current?.getBlocks() || []
    const hasContent = blocks.some(b => (b.type === 'text' && textContentForSearch(b.content).trim()) || b.type === 'image' || b.type === 'video' || b.type === 'file' || b.type === 'externalEmbed' || b.type === 'poll')
    if (!hasContent) { setError('내용을 입력하거나 사진/영상/첨부파일을 추가해주세요.'); return }

    setSaving(true)
    setError('')
    try {
      let postId
      if (isEditing) {
        postId = initialPost.id
      } else {
        setSavingStep('글 등록 중...')
        const placeholder = textContentForSearch(blocks.find(b => b.type === 'text' && textContentForSearch(b.content).trim())?.content || '').trim() || '...'
        const created = await createCommunityPost({ title: title.trim(), content: placeholder, category: effectiveCategory, anonymousName: anonymousName.trim() })
        postId = created.id
      }

      const uploadedBlocks = []
      for (const block of blocks) {
        if (block.type === 'text') {
          uploadedBlocks.push(block)
        } else if (block.status !== 'saved' && block.file) {
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

      const contentJson = JSON.stringify(
        uploadedBlocks.map(b => {
          if (b.type === 'text') return { type: 'text', content: b.content }
          if (b.type === 'image' && b.mediaId) return { type: 'image', mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
          if (b.type === 'video' && b.mediaId) return { type: 'video', mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
          if (b.type === 'file' && b.fileId) return { type: 'file', fileId: b.fileId, name: b.name }
          if (b.type === 'externalEmbed') return { type: 'externalEmbed', provider: b.provider, kind: b.kind, url: b.url, embedUrl: b.embedUrl, title: b.title, thumbnailUrl: b.thumbnailUrl, width: b.width || 75, align: b.align || 'center' }
          if (b.type === 'poll') return { type: 'poll', pollId: b.pollId, question: b.question, options: b.options || [], closesAt: b.closesAt, closedAt: b.closedAt }
          return null
        }).filter(Boolean)
      )

      const removeLegacyImage = Boolean(initialPost?.imageUrl && !uploadedBlocks.some(b => b.legacy))
      setSavingStep('저장 중...')
      const saved = await updateCommunityPost(postId, { title: title.trim(), content: contentJson, category: effectiveCategory, removeImage: removeLegacyImage, anonymousName: anonymousName.trim() })
      onSave(saved)
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
      setSavingStep('')
    }
  }

  return (
    <form onSubmit={submit} className="community-compose-form grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
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
          initialBlocks={initialBlocks}
          apiRef={editorApiRef}
          features={FULL_RICH_FEATURES}
          onError={(msg) => setError(msg)}
          searchYoutube={searchYoutubeVideos}
          fetchLinkPreview={fetchLinkPreview}
        />
      </div>

      {error && <p className="community-compose-error order-5 text-sm font-semibold text-red-500 lg:col-start-2">{error}</p>}

      <div className="community-compose-actions order-6 flex flex-col gap-2 sm:flex-row lg:col-start-2 lg:flex-col">
        <button type="submit" disabled={saving || !title.trim()}
          className="apple-action-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50 sm:min-h-0"
        >
          {saving ? (savingStep || '저장 중...') : isEditing ? '수정 완료' : '글 등록'}
        </button>
        <button type="button" onClick={onCancel}
          className="apple-action-secondary inline-flex min-h-11 items-center justify-center gap-1 px-4 py-2.5 text-sm sm:min-h-0"
        >
          <X size={14} />취소
        </button>
      </div>
    </form>
  )
}
