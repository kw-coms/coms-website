import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { createPost, searchArchiveVisibilityMembers, updateArchiveFile, type ArchiveVisibility } from '../../services/archiveApi'
import { usePermissions } from '../../contexts/usePermissions'
import { useAuth } from '../../contexts/useAuth'
import { PERMISSIONS } from '../../utils/roleAccess'
import { ownsArchive } from '../../utils/contentEditing'
import { parseRichBodyBlocks } from '../richEditor/parseRichBodyBlocks'
import { fetchLinkPreview, searchYoutubeVideos } from '../../services/communityApi'
import RichBodyEditor from '../richEditor/RichBodyEditor'
import { UPLOAD_RICH_FEATURES } from '../richEditor/richBodyFeatures'

// Archive entries already carry their files through "파일 선택"; a second file button inside the
// description would be two ways to attach the same thing, so the description takes images and video only.
const ARCHIVE_DESCRIPTION_FEATURES = { ...UPLOAD_RICH_FEATURES, fileUpload: false }
import { resetRejectedRichBlocks, uploadPendingRichBlocks } from '../richEditor/uploadPendingRichBlocks'
import { serializeRichBody } from '../richEditor/serializeRichBody'
import { CategorySegment } from './CategorySegment'
import { ARCHIVE_VISIBILITY_LABELS, WRITABLE_ARCHIVE_CATEGORIES, archiveAttachments, formatSize } from './archiveUtils'

export function WriteForm({ onCancel, onSave, initialFile }: {
  initialFile?: { id: number; title?: string; originalName?: string; uploadedBy?: string; description?: string; category?: string; visibility?: ArchiveVisibility; selectedStudentIds?: string[]; attachments?: { id?: number; originalName: string; fileSize: number; contentVersion?: string }[] }
  onCancel: () => void
  onSave: (savedList: unknown[]) => void
}) {
  const [form, setForm] = useState({ title: initialFile?.title || initialFile?.originalName || '', category: initialFile?.category || 'GENERAL' })
  const [files, setFiles] = useState<File[]>([])
  const [visibility, setVisibility] = useState<ArchiveVisibility>(initialFile?.visibility || 'MEMBERS')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(initialFile?.selectedStudentIds || [])
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<{ studentId: string; name: string; role: string }[]>([])
  const [memberSearchError, setMemberSearchError] = useState(false)
  const [memberSearchNonce, setMemberSearchNonce] = useState(0)
  const { user } = useAuth()
  const { can } = usePermissions()
  const canSetRestricted = can(PERMISSIONS.archiveVisibility)
  const canChangeVisibility = initialFile?.visibility !== 'GROUP' && (!initialFile || canSetRestricted ||
    ownsArchive(user, initialFile) && ['PUBLIC', 'MEMBERS'].includes(initialFile.visibility || 'MEMBERS'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const editorApiRef = useRef(null)
  const initialBlocks = useMemo(() => initialFile ? parseRichBodyBlocks(initialFile.description || '') : [], [initialFile])
  const existingAttachments = initialFile ? archiveAttachments(initialFile) : []

  useEffect(() => {
    if (visibility !== 'SELECTED' || !canSetRestricted) return
    let active = true
    // A new search starts with a clean error state in its async continuation.
    searchArchiveVisibilityMembers(memberQuery)
      .then((members) => { if (active) { setMemberResults(members); setMemberSearchError(false) } })
      .catch(() => { if (active) { setMemberResults([]); setMemberSearchError(true) } })
    return () => { active = false }
  }, [visibility, canSetRestricted, memberQuery, memberSearchNonce])

  const addFiles = (event) => {
    const picked = Array.from(event.target.files || []) as File[]
    if (picked.length) setFiles((prev) => [...prev, ...picked])
    // Reset so re-selecting the same file fires onChange again.
    event.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async (event) => {
    event.preventDefault()
    const blocks = editorApiRef.current?.getBlocks() || []
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!initialFile && files.length === 0) { setError('파일을 선택해주세요.'); return }
    if (visibility === 'SELECTED' && canSetRestricted && selectedStudentIds.length === 0) { setError('공개할 회원을 선택해주세요.'); return }
    if (!editorApiRef.current) { setError('편집기를 불러오는 중입니다. 잠시 후 저장해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const uploaded = await uploadPendingRichBlocks(blocks, 'archive', (id, patch) => editorApiRef.current?.updateFigureMeta(id, patch))
      const description = serializeRichBody(uploaded)
      const metadata = {
        title: form.title.trim(),
        description,
        category: form.category,
      }
      const visibilityInput = initialFile && visibility === (initialFile.visibility || 'MEMBERS') &&
        (visibility !== 'SELECTED' || selectedStudentIds.join(',') === (initialFile.selectedStudentIds || []).join(','))
        ? {} : { visibility, selectedStudentIds: visibility === 'SELECTED' ? selectedStudentIds : [] }
      const saved = initialFile
        ? await updateArchiveFile(initialFile.id, { ...metadata, ...visibilityInput, files: files.length ? files : undefined })
        : await createPost({ ...metadata, ...visibilityInput, files })
      onSave([saved])
    } catch (err) {
      resetRejectedRichBlocks(blocks, err, (id, patch) => editorApiRef.current?.updateFigureMeta(id, patch))
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

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-bold text-[var(--app-subtle)]">공개 범위</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ARCHIVE_VISIBILITY_LABELS) as ArchiveVisibility[]).filter(value => value !== 'GROUP' || initialFile?.visibility === 'GROUP').map((value) => (
            <label key={value} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${visibility === value ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-muted)]'} ${!canChangeVisibility || !canSetRestricted && (value === 'OFFICERS' || value === 'SELECTED') ? 'opacity-50' : 'cursor-pointer'}`}>
              <input type="radio" name={`archive-visibility-${initialFile?.id ?? 'new'}`} value={value} checked={visibility === value} disabled={saving || !canChangeVisibility || !canSetRestricted && (value === 'OFFICERS' || value === 'SELECTED')} onChange={() => setVisibility(value)} />
              {ARCHIVE_VISIBILITY_LABELS[value]}
            </label>
          ))}
        </div>
        {visibility === 'SELECTED' && canSetRestricted && (
          <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-3">
            <label className="block text-xs font-bold text-[var(--app-subtle)]">
              공개할 회원 검색 (이름 또는 학번)
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)]" />
            </label>
            <div className="mt-2 max-h-48 overflow-y-auto">
              {memberResults.map((member) => (
                <label key={member.studentId} className="flex min-h-11 cursor-pointer items-center gap-3 px-2 text-sm text-[var(--app-text)]">
                  <input type="checkbox" checked={selectedStudentIds.includes(member.studentId)} onChange={(event) => setSelectedStudentIds((ids) => event.target.checked ? [...ids, member.studentId] : ids.filter((id) => id !== member.studentId))} />
                  {member.name} · {member.studentId}
                </label>
              ))}
            </div>
            {memberSearchError && <p role="alert" className="mt-2 text-xs text-red-600">회원 검색에 실패했습니다. <button type="button" onClick={() => setMemberSearchNonce((value) => value + 1)} className="min-h-11 underline">다시 시도</button></p>}
            {selectedStudentIds.length > 0 && <p className="mt-2 break-all text-xs text-[var(--app-muted)]">선택: {selectedStudentIds.join(', ')}</p>}
          </div>
        )}
      </fieldset>

      <div className="block">
        <span className="mb-2 block text-xs font-bold text-[var(--app-subtle)]">설명 (선택)</span>
        <RichBodyEditor
          initialBlocks={initialBlocks}
          apiRef={editorApiRef}
          features={ARCHIVE_DESCRIPTION_FEATURES}
          allowArchiveFiles
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
              disabled={saving}
              className="hidden"
              onChange={addFiles}
            />
          </label>
          <span className="min-w-0 flex-1 truncate font-medium">
            {files.length === 0 ? initialFile ? existingAttachments.length > 1 ? `${existingAttachments.length}개 기존 파일 유지` : `기존 파일 유지: ${initialFile.originalName}` : '선택된 파일 없음' : `${files.length}개 파일 선택됨`}
          </span>
        </div>
        <p className="text-xs font-medium text-[var(--app-subtle)]">
          {initialFile && files.length > 0 ? '기존 첨부파일 전체가 선택한 파일로 교체됩니다.' : '선택한 파일은 모두 한 자료에 첨부됩니다.'}
        </p>
        {initialFile && files.length === 0 && existingAttachments.length > 1 && (
          <ul className="space-y-1.5">
            {existingAttachments.map((attachment, index) => (
              <li key={attachment.id ?? index} className="flex gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 break-all">{attachment.originalName}</span>
                <span className="shrink-0 text-xs">{formatSize(attachment.fileSize)}</span>
              </li>
            ))}
          </ul>
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
                  disabled={saving}
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
          disabled={saving || (!initialFile && files.length === 0)}
          className="apple-action-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm disabled:opacity-50 sm:min-h-10"
        >
          <FileUp size={15} />
          {saving ? '저장 중...' : initialFile ? '수정 저장' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="apple-action-secondary inline-flex min-h-12 items-center justify-center gap-1.5 px-4 text-sm sm:min-h-10"
        >
          <X size={14} />
          취소
        </button>
      </div>
    </form>
  )
}
