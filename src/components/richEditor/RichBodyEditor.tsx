import { useState } from 'react'
import { ImagePlus, Link, Paperclip, Plus, Search, Video } from 'lucide-react'
import RichEditor from '../../pages/community/RichEditor'
import {
  POLL_DURATION_OPTIONS,
  datetimeLocalValue,
  externalBlockFromUrl,
  newPollBlock,
} from '../../pages/community/postEditorUtils'
import { FULL_RICH_FEATURES } from './richBodyFeatures'

/**
 * Reusable rich-body editor: toolbar + insert panels + contenteditable surface.
 * Used by the community PostEditor (all features) and by notices/resources
 * (URL/embed subset). `apiRef` exposes getBlocks()/updateFigureMeta()/etc.
 * `searchYoutube` is injected so callers control which backend search to use.
 */
export default function RichBodyEditor({
  initialBlocks,
  apiRef,
  features = FULL_RICH_FEATURES,
  error,
  onError,
  searchYoutube,
  fetchLinkPreview,
}: any) {
  const editorApiRef = apiRef
  const [externalUrl, setExternalUrl] = useState('')
  const [externalLoading, setExternalLoading] = useState(false)
  const [youtubeQuery, setYoutubeQuery] = useState('')
  const [youtubeResults, setYoutubeResults] = useState([])
  const [youtubeSearching, setYoutubeSearching] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptionInputs, setPollOptionInputs] = useState([{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }])
  const [pollDurationMinutes, setPollDurationMinutes] = useState(60)
  const [activeInsertTool, setActiveInsertTool] = useState('')

  const setError = (msg) => onError?.(msg)
  const applyFormat = (command, value = null) => {
    editorApiRef.current?.formatBlock(command, value)
  }

  const insertExternalUrl = async () => {
    let block
    try {
      block = externalBlockFromUrl(externalUrl)
    } catch (err) {
      setError(err.message || '외부 콘텐츠를 삽입할 수 없습니다.')
      return
    }
    // For generic link cards, enrich with OpenGraph meta from the backend before
    // inserting. If the lookup fails we still insert the basic domain-only card.
    if (block.kind === 'link' && fetchLinkPreview) {
      setError('')
      setExternalLoading(true)
      try {
        const meta = await fetchLinkPreview(block.url)
        if (meta) {
          block = {
            ...block,
            title: meta.title || block.title,
            description: meta.description || '',
            image: meta.image || '',
            siteName: meta.siteName || block.siteName,
          }
        }
      } catch {
        // keep the basic card
      } finally {
        setExternalLoading(false)
      }
    }
    editorApiRef.current?.insertExternalEmbed(block)
    setExternalUrl('')
    setActiveInsertTool('')
    setError('')
  }

  const handleYoutubeSearch = async () => {
    if (youtubeQuery.trim().length < 2) { setError('유튜브 검색어를 2자 이상 입력해주세요.'); return }
    if (!searchYoutube) { setError('영상 검색을 사용할 수 없습니다.'); return }
    setYoutubeSearching(true)
    setError('')
    try {
      const data = await searchYoutube(youtubeQuery.trim())
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

  const tipText = features.imageUpload || features.videoUpload || features.fileUpload
    ? '본문 칸에 드래그하거나 Ctrl+V로 바로 삽입 · 필요한 도구만 열어서 사용'
    : '외부 이미지/영상/YouTube 링크를 URL로 삽입하거나 영상을 검색해서 추가하세요.'

  return (
    <div className="community-compose-editor overflow-hidden rounded border border-black/15 bg-[var(--app-surface)]">
      <div className="community-editor-toolbar flex flex-wrap items-center gap-2 border-b border-[var(--app-hairline)] bg-black/[0.03] px-3 py-2">
        <span className="mr-1 text-xs font-black uppercase tracking-[0.2em] text-[var(--theme-body-muted)]">Editor</span>
        {features.format && (
        <div className="inline-flex overflow-hidden rounded border border-black/15 bg-[var(--app-surface)]">
          <button type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => applyFormat('bold')}
            aria-label="굵게"
            className="min-h-9 px-3 text-sm font-black text-[var(--theme-body-dark)] hover:bg-black/5">B</button>
          <button type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => applyFormat('italic')}
            aria-label="기울임"
            className="min-h-9 px-3 text-sm italic text-[var(--theme-body-dark)] hover:bg-black/5">I</button>
          <button type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => applyFormat('underline')}
            aria-label="밑줄"
            className="min-h-9 px-3 text-sm underline text-[var(--theme-body-dark)] hover:bg-black/5">U</button>
        </div>
        )}
        {features.font && (
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
        )}
        {features.textColor && (
        <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          글자색
          <input type="color" defaultValue="#111827" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onChange={(e) => applyFormat('foreColor', e.target.value)} />
        </label>
        )}
        {features.background && (
        <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          배경
          <input type="color" defaultValue="#fff3a3" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onChange={(e) => applyFormat('hiliteColor', e.target.value)} />
        </label>
        )}
        {features.imageUpload && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          <ImagePlus size={14} />이미지
          <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
            onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </label>
        )}
        {features.videoUpload && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          <Video size={14} />동영상
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
            onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </label>
        )}
        {features.fileUpload && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          <Paperclip size={14} />압축파일
          <input type="file" multiple accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
            onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </label>
        )}
        {features.urlEmbed && (
        <button type="button" onClick={() => setActiveInsertTool((tool) => tool === 'url' ? '' : 'url')}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${activeInsertTool === 'url' ? 'border-[#3b4890] bg-[#eef3ff] text-[#3b4890]' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-mid)] hover:bg-black/5'}`}>
          <Link size={14} />URL 삽입
        </button>
        )}
        {features.videoSearch && (
        <button type="button" onClick={() => setActiveInsertTool((tool) => tool === 'youtube' ? '' : 'youtube')}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${activeInsertTool === 'youtube' ? 'border-[#3b4890] bg-[#eef3ff] text-[#3b4890]' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-mid)] hover:bg-black/5'}`}>
          <Search size={14} />영상 검색
        </button>
        )}
        {features.poll && (
        <button type="button" onClick={() => setActiveInsertTool((tool) => tool === 'poll' ? '' : 'poll')}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${activeInsertTool === 'poll' ? 'border-[#3b4890] bg-[#eef3ff] text-[#3b4890]' : 'border-black/15 bg-[var(--app-surface)] text-[var(--theme-body-mid)] hover:bg-black/5'}`}>
          <Plus size={14} />투표
        </button>
        )}
        <span className="text-xs text-[var(--theme-body-muted)]">{tipText}</span>
      </div>
      {activeInsertTool && (
      <div className="space-y-3 border-b border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-3">
        {activeInsertTool === 'url' && features.urlEmbed && (
        <div className="flex flex-col gap-2 lg:flex-row">
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            onFocus={() => editorApiRef.current?.saveSelection()}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!externalLoading) insertExternalUrl() } }}
            placeholder="이미지/영상/YouTube/링크 URL"
            className="min-h-10 flex-1 rounded border border-black/15 px-3 text-sm outline-none focus:border-[#3b4890]"
          />
          <button type="button" onClick={insertExternalUrl} disabled={externalLoading} className="inline-flex min-h-10 items-center justify-center gap-1 rounded border border-black/15 bg-[var(--app-surface)] px-3 text-sm font-bold text-[var(--theme-body-mid)] hover:bg-black/5 disabled:opacity-50">
            <Link size={14} /> {externalLoading ? '불러오는 중...' : 'URL 삽입'}
          </button>
        </div>
        )}
        {activeInsertTool === 'youtube' && features.videoSearch && (
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
                {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="h-16 w-24 rounded object-cover" loading="lazy" decoding="async" />}
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
        {activeInsertTool === 'poll' && features.poll && (
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
      {error && <p className="border-b border-[var(--app-hairline)] bg-red-50 px-3 py-2 text-sm font-semibold text-red-500">{error}</p>}
      <RichEditor initialBlocks={initialBlocks} apiRef={editorApiRef} onError={(msg) => setError(msg)} />
    </div>
  )
}
