import { useMemo, useRef, useState } from 'react'
import { ImagePlus, Link, Paperclip, Plus, Search, Video, X } from 'lucide-react'
import {
  createCommunityPost,
  searchYoutubeVideos,
  updateCommunityPost,
  uploadPostFile,
  uploadPostImages,
  uploadPostVideo,
} from '../../services/communityApi.js'
import RichEditor from './RichEditor.jsx'
import {
  MAX_ANONYMOUS_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  POLL_DURATION_OPTIONS,
  categoryOptionsForUser,
  datetimeLocalValue,
  externalBlockFromUrl,
  newPollBlock,
  optimizeImageFile,
  parsePostBlocks,
  textContentForSearch,
} from './postEditorUtils.js'

export default function PostEditor({ initialPost, onCancel, onSave, user }) {
  const isEditing = Boolean(initialPost)
  const [title, setTitle] = useState(initialPost?.title || '')
  const [category, setCategory] = useState(initialPost?.category || 'GENERAL')
  const [anonymousName, setAnonymousName] = useState(initialPost?.anonymousName || '')
  const [externalUrl, setExternalUrl] = useState('')
  const [youtubeQuery, setYoutubeQuery] = useState('')
  const [youtubeResults, setYoutubeResults] = useState([])
  const [youtubeSearching, setYoutubeSearching] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptionInputs, setPollOptionInputs] = useState([{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }])
  const [pollDurationMinutes, setPollDurationMinutes] = useState(60)
  const [activeInsertTool, setActiveInsertTool] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState('')
  const [error, setError] = useState('')
  const editorApiRef = useRef(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialBlocks = useMemo(() => isEditing ? parsePostBlocks(initialPost) : [], [])
  const applyFormat = (command, value = null) => {
    editorApiRef.current?.formatBlock(command, value)
  }
  const categoryOptions = useMemo(() => categoryOptionsForUser(user), [user])
  const effectiveCategory = categoryOptions.some((item) => item.value === category) ? category : 'GENERAL'

  const insertExternalUrl = () => {
    try {
      const block = externalBlockFromUrl(externalUrl)
      editorApiRef.current?.insertExternalEmbed(block)
      setExternalUrl('')
      setActiveInsertTool('')
      setError('')
    } catch (err) {
      setError(err.message || '외부 콘텐츠를 삽입할 수 없습니다.')
    }
  }

  const handleYoutubeSearch = async () => {
    if (youtubeQuery.trim().length < 2) { setError('유튜브 검색어를 2자 이상 입력해주세요.'); return }
    setYoutubeSearching(true)
    setError('')
    try {
      const data = await searchYoutubeVideos(youtubeQuery.trim())
      setYoutubeResults(data.items || [])
    } catch (err) {
      setError((err.message || '유튜브 검색 실패') + ' URL 붙여넣기 임베드는 계속 사용할 수 있습니다.')
    } finally {
      setYoutubeSearching(false)
    }
  }

  const insertYoutubeResult = (item) => {
    editorApiRef.current?.insertExternalEmbed(externalBlockFromUrl(`https://www.youtube.com/watch?v=${item.videoId}`, {
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
    }))
    setYoutubeResults([])
    setYoutubeQuery('')
    setActiveInsertTool('')
  }

  const insertPollBlock = () => {
    try {
      const closesAt = pollDurationMinutes > 0 ? datetimeLocalValue(pollDurationMinutes) : ''
      const block = newPollBlock(pollQuestion, pollOptionInputs, closesAt)
      editorApiRef.current?.insertPoll(block)
      setPollQuestion('')
      setPollOptionInputs([{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }])
      setPollDurationMinutes(60)
      setActiveInsertTool('')
      setError('')
    } catch (err) {
      setError(err.message || '투표를 추가할 수 없습니다.')
    }
  }

  const updatePollOption = (index, field, value) => {
    setPollOptionInputs((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)))
  }

  const addPollOption = () => {
    setPollOptionInputs((prev) => (prev.length >= 10 ? prev : [...prev, { label: '', imageUrl: '' }]))
  }

  const removePollOption = (index) => {
    setPollOptionInputs((prev) => (prev.length <= 2 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)))
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
          className="w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24"
        >
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE_LENGTH}
        placeholder="제목"
        className="community-compose-title order-1 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-1 lg:row-start-1"
      />

      {effectiveCategory === 'ANONYMOUS' && (
        <input
          value={anonymousName}
          onChange={(e) => setAnonymousName(e.target.value)}
          maxLength={MAX_ANONYMOUS_NAME_LENGTH}
          placeholder="ㅇㅇ"
          className="community-compose-anonymous order-3 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-2 lg:row-start-2"
        />
      )}

      <div className="community-compose-editor order-4 overflow-hidden rounded border border-black/15 bg-[var(--app-surface)] lg:col-start-1 lg:row-start-2 lg:row-span-5">
        <div className="community-editor-toolbar flex flex-wrap items-center gap-2 border-b border-[var(--app-hairline)] bg-black/[0.03] px-3 py-2">
          <span className="mr-1 text-xs font-black uppercase tracking-[0.2em] text-[var(--theme-body-muted)]">Editor</span>
          <div className="inline-flex overflow-hidden rounded border border-black/15 bg-[var(--app-surface)]">
            <button type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => applyFormat('bold')}
              className="min-h-9 px-3 text-sm font-black text-[var(--theme-body-dark)] hover:bg-black/5">B</button>
            <button type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => applyFormat('italic')}
              className="min-h-9 px-3 text-sm italic text-[var(--theme-body-dark)] hover:bg-black/5">I</button>
            <button type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => applyFormat('underline')}
              className="min-h-9 px-3 text-sm underline text-[var(--theme-body-dark)] hover:bg-black/5">U</button>
          </div>
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}>
            글꼴
            <select
              defaultValue=""
              className="bg-transparent text-xs outline-none"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const value = e.target.value
                if (!value) return
                applyFormat('fontName', value)
                e.target.value = ''
              }}
            >
              <option value="" disabled>선택</option>
              <option value='Pretendard, -apple-system, BlinkMacSystemFont, sans-serif'>Pretendard</option>
              <option value="'Noto Sans KR', sans-serif">Noto Sans KR</option>
              <option value="'IBM Plex Sans KR', sans-serif">IBM Plex Sans KR</option>
              <option value="'Nanum Gothic', sans-serif">Nanum Gothic</option>
              <option value="'Gowun Dodum', sans-serif">Gowun Dodum</option>
              <option value="'Nanum Myeongjo', serif">Nanum Myeongjo</option>
              <option value="ui-monospace, SFMono-Regular, Menlo, monospace">Monospace</option>
            </select>
          </label>
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            글자색
            <input type="color" defaultValue="#111827" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onChange={(e) => applyFormat('foreColor', e.target.value)} />
          </label>
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            배경
            <input type="color" defaultValue="#fff3a3" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onChange={(e) => applyFormat('hiliteColor', e.target.value)} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <ImagePlus size={14} />이미지
            <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
              onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <Video size={14} />동영상
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <Paperclip size={14} />압축파일
            <input type="file" multiple accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
              onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <button type="button" onClick={() => setActiveInsertTool((tool) => tool === 'url' ? '' : 'url')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${activeInsertTool === 'url' ? 'border-[#3b4890] bg-[#eef3ff] text-[#3b4890]' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-mid)] hover:bg-black/5'}`}>
            <Link size={14} />URL 삽입
          </button>
          <button type="button" onClick={() => setActiveInsertTool((tool) => tool === 'youtube' ? '' : 'youtube')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${activeInsertTool === 'youtube' ? 'border-[#3b4890] bg-[#eef3ff] text-[#3b4890]' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-mid)] hover:bg-black/5'}`}>
            <Search size={14} />영상 검색
          </button>
          <button type="button" onClick={() => setActiveInsertTool((tool) => tool === 'poll' ? '' : 'poll')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${activeInsertTool === 'poll' ? 'border-[#3b4890] bg-[#eef3ff] text-[#3b4890]' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-mid)] hover:bg-black/5'}`}>
            <Plus size={14} />투표
          </button>
          <span className="text-xs text-[var(--theme-body-muted)]">본문 칸에 드래그하거나 Ctrl+V로 바로 삽입 · 필요한 도구만 열어서 사용</span>
        </div>
        {activeInsertTool && (
        <div className="space-y-3 border-b border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-3">
          {activeInsertTool === 'url' && (
          <div className="flex flex-col gap-2 lg:flex-row">
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              onFocus={() => editorApiRef.current?.saveSelection()}
              placeholder="외부 이미지/영상/YouTube URL"
              className="min-h-10 flex-1 rounded border border-black/15 px-3 text-sm outline-none focus:border-[#3b4890]"
            />
            <button type="button" onClick={insertExternalUrl} className="inline-flex min-h-10 items-center justify-center gap-1 rounded border border-black/15 bg-[var(--app-surface)] px-3 text-sm font-bold text-[var(--theme-body-mid)] hover:bg-black/5">
              <Link size={14} /> URL 삽입
            </button>
          </div>
          )}
          {activeInsertTool === 'youtube' && (
          <>
          <div className="flex flex-col gap-2 lg:flex-row">
            <input
              type="text"
              value={youtubeQuery}
              onChange={(e) => setYoutubeQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleYoutubeSearch() } }}
              placeholder="YouTube 영상 검색"
              className="min-h-10 flex-1 rounded border border-black/15 px-3 text-sm outline-none focus:border-[#3b4890]"
            />
            <button type="button" onClick={handleYoutubeSearch} disabled={youtubeSearching} className="inline-flex min-h-10 items-center justify-center gap-1 rounded border border-black/15 bg-[var(--app-surface)] px-3 text-sm font-bold text-[var(--theme-body-mid)] hover:bg-black/5 disabled:opacity-50">
              <Search size={14} /> {youtubeSearching ? '검색 중...' : '영상 검색'}
            </button>
          </div>
          {youtubeResults.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {youtubeResults.map((item) => (
                <button key={item.videoId} type="button" onClick={() => insertYoutubeResult(item)} className="flex gap-2 rounded border border-[var(--app-hairline)] bg-black/[0.03] p-2 text-left hover:bg-black/[0.06]">
                  {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="h-16 w-24 rounded object-cover" />}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-bold text-[var(--theme-body-dark)]">{item.title}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--theme-body-muted)]">{item.channelTitle}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          </>
          )}
          {activeInsertTool === 'poll' && (
          <div className="rounded-xl border border-[#3b4890]/15 bg-[#f7f9ff] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-[#23306d]">투표 만들기</p>
                <p className="text-xs font-semibold text-[var(--theme-body-muted)]">투표는 한 번 하면 변경/취소할 수 없고, 종료 후에는 결과만 보입니다.</p>
              </div>
              <button type="button" onClick={insertPollBlock} className="inline-flex min-h-10 items-center justify-center gap-1 rounded bg-[#3b4890] px-3 text-sm font-bold text-white shadow-sm hover:bg-[#2f3a7a]">
                <Plus size={14} /> 본문에 추가
              </button>
            </div>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="투표 제목 입력"
              className="mb-2 min-h-11 w-full rounded-lg border border-[#3b4890]/15 bg-[var(--app-surface)] px-3 text-sm font-semibold outline-none focus:border-[#3b4890]"
            />
            <div className="mb-3">
              <div className="mb-2 text-xs font-black text-[#23306d]">종료 시간</div>
              <div className="flex flex-wrap gap-2">
                {POLL_DURATION_OPTIONS.map((option) => {
                  const selected = pollDurationMinutes === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPollDurationMinutes(option.value)}
                      className={`min-h-10 rounded-full border px-3 text-xs font-black transition sm:text-sm ${selected
                        ? 'border-[#3b4890] bg-[#3b4890] text-white shadow-sm'
                        : 'border-[#3b4890]/15 bg-[var(--app-surface)] text-[#23306d] hover:border-[#3b4890]/40 hover:bg-[#f4f6ff]'
                      }`}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs font-semibold text-[#4b587c]">
                {pollDurationMinutes > 0 ? '선택한 시간 뒤 자동으로 투표가 종료됩니다.' : '작성자나 관리자가 직접 종료할 때까지 투표가 열립니다.'}
              </p>
            </div>
            <div className="space-y-2">
              {pollOptionInputs.map((option, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-[var(--app-hairline)] bg-white/70 p-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#3b4890] text-xs font-black text-white">{index + 1}</span>
                  <input
                    type="text"
                    value={option.label}
                    onChange={(e) => updatePollOption(index, 'label', e.target.value)}
                    placeholder={`보기 ${index + 1}`}
                    className="min-h-10 flex-1 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-sm outline-none focus:border-[#3b4890]"
                  />
                  <input
                    type="url"
                    value={option.imageUrl}
                    onChange={(e) => updatePollOption(index, 'imageUrl', e.target.value)}
                    placeholder="보기 이미지 URL(선택)"
                    className="min-h-10 flex-1 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-sm outline-none focus:border-[#3b4890]"
                  />
                  <button
                    type="button"
                    onClick={() => removePollOption(index)}
                    disabled={pollOptionInputs.length <= 2}
                    className="min-h-10 rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-30"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addPollOption}
              disabled={pollOptionInputs.length >= 10}
              className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#3b4890]/45 bg-white/70 text-sm font-bold text-[#3b4890] transition hover:bg-[var(--app-surface)] disabled:opacity-40"
            >
              <Plus size={16} /> 보기 추가
            </button>
          </div>
          )}
        </div>
        )}
        <RichEditor initialBlocks={initialBlocks} apiRef={editorApiRef} onError={(msg) => setError(msg)} />
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

