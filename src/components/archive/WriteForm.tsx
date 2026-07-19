import { useRef, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { createPosts } from '../../services/archiveApi'
import { fetchLinkPreview, searchYoutubeVideos } from '../../services/communityApi'
import RichBodyEditor from '../richEditor/RichBodyEditor'
import { URL_ONLY_RICH_FEATURES } from '../richEditor/richBodyFeatures'
import { serializeRichBody } from '../richEditor/serializeRichBody'
import { CategorySegment } from './CategorySegment'
import { WRITABLE_ARCHIVE_CATEGORIES, formatSize } from './archiveUtils'

export function WriteForm({ onCancel, onSave }: {
  onCancel: () => void
  onSave: (savedList: unknown[], failedNames: string[]) => void
}) {
  const [form, setForm] = useState({ title: '', category: 'GENERAL' })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const editorApiRef = useRef(null)

  const addFiles = (event) => {
    const picked = Array.from(event.target.files || [])
    if (picked.length) setFiles((prev) => [...prev, ...picked])
    // Reset so re-selecting the same file fires onChange again.
    event.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return }
    if (files.length === 0) { setError('파일을 선택해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const blocks = editorApiRef.current?.getBlocks() || []
      const description = serializeRichBody(blocks)
      const results = await createPosts(files, {
        title: form.title.trim(),
        description,
        category: form.category,
      })
      const succeeded = results.filter((r) => r.ok)
      const failed = results.filter((r) => !r.ok)
      if (succeeded.length === 0) {
        setError(failed[0]?.error?.message || '업로드 중 오류가 발생했습니다.')
        return
      }
      onSave(succeeded.map((r) => r.saved), failed.map((r) => r.file.name))
    } catch (err) {
      setError(err.message || '업로드 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="apple-soft-panel space-y-5 p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <label className="block">
          <span className="mb-2 block text-xs font-bold text-[var(--app-subtle)]">제목</span>
          <input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            maxLength={200}
            placeholder="자료 제목"
            className="h-12 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 text-sm text-[var(--app-text)] outline-none transition focus:ring-2 focus:ring-[var(--app-accent)]/24"
          />
        </label>
        <div>
          <span className="mb-2 block text-xs font-bold text-[var(--app-subtle)]">카테고리</span>
          <CategorySegment
            value={form.category}
            onChange={(category) => setForm((p) => ({ ...p, category }))}
            items={WRITABLE_ARCHIVE_CATEGORIES}
          />
        </div>
      </div>

      <div className="block">
        <span className="mb-2 block text-xs font-bold text-[var(--app-subtle)]">설명 (선택)</span>
        <RichBodyEditor
          initialBlocks={[]}
          apiRef={editorApiRef}
          features={URL_ONLY_RICH_FEATURES}
          onError={setError}
          searchYoutube={searchYoutubeVideos}
          fetchLinkPreview={fetchLinkPreview}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-3 text-sm text-[var(--app-muted)]">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 font-bold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] sm:min-h-10 sm:px-3.5">
            <FileUp size={15} />
            파일 선택
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={addFiles}
            />
          </label>
          <span className="min-w-0 flex-1 truncate font-medium">
            {files.length === 0 ? '선택된 파일 없음' : `${files.length}개 파일 선택됨`}
          </span>
        </div>
        {files.length > 1 && (
          <p className="text-xs font-medium text-[var(--app-subtle)]">
            파일마다 별도 자료로 등록되며, 제목 뒤에 번호가 붙습니다. (예: {form.title.trim() || '제목'} (1))
          </p>
        )}
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((selected, index) => (
              <li
                key={`${selected.name}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--app-text)]">{selected.name}</span>
                <span className="shrink-0 text-xs font-bold text-[var(--app-subtle)]">{formatSize(selected.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-hairline)] text-[var(--app-muted)] transition hover:bg-[var(--app-surface-elevated)]"
                  aria-label={`${selected.name} 제거`}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <button
          type="submit"
          disabled={saving || files.length === 0}
          className="apple-action-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm disabled:opacity-50 sm:min-h-10"
        >
          <FileUp size={15} />
          {saving ? '업로드 중...' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="apple-action-secondary inline-flex min-h-12 items-center justify-center gap-1.5 px-4 text-sm sm:min-h-10"
        >
          <X size={14} />
          취소
        </button>
      </div>
    </form>
  )
}
