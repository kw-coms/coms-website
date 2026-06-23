import { useEffect, useMemo, useRef, useState } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { ArrowLeft, Download, FileUp, RefreshCw, Search, ThumbsUp, Trash2, X } from 'lucide-react'
import { createPosts, deleteFile, downloadUrl, listFiles, voteArchiveFile } from '../services/archiveApi'
import { fetchLinkPreview, searchYoutubeVideos } from '../services/communityApi'
import { useAuth } from '../contexts/useAuth'
import { ArchiveCategory } from '../contract/enums'
import { enumLabels } from '../contract/labels'
import RichBodyEditor from '../components/richEditor/RichBodyEditor'
import { URL_ONLY_RICH_FEATURES } from '../components/richEditor/richBodyFeatures'
import { renderRichBody, richBodyToPlainText } from '../components/richEditor/renderRichBody'
import { serializeRichBody } from '../components/richEditor/serializeRichBody'

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

function clickableCell(open) {
  return { onClick: open }
}

// Labels keyed by the canonical ArchiveFile.Category enum (drift-guarded);
// 'ALL' is a UI-only pseudo-category, not part of the contract.
const ARCHIVE_CATEGORY_LABELS = enumLabels(ArchiveCategory, {
  [ArchiveCategory.GENERAL]: '일반 자료',
  [ArchiveCategory.ACADEMIC_JOURNAL]: '학술회지',
})

const ARCHIVE_CATEGORIES = [
  { value: 'ALL', label: '전체' },
  { value: ArchiveCategory.GENERAL, label: ARCHIVE_CATEGORY_LABELS[ArchiveCategory.GENERAL] },
  { value: ArchiveCategory.ACADEMIC_JOURNAL, label: ARCHIVE_CATEGORY_LABELS[ArchiveCategory.ACADEMIC_JOURNAL] },
]

const WRITABLE_ARCHIVE_CATEGORIES = ARCHIVE_CATEGORIES.filter((item) => item.value !== 'ALL')

function categoryLabel(value) {
  return ARCHIVE_CATEGORIES.find((item) => item.value === value)?.label || '일반 자료'
}

function CategorySegment({ value, onChange, items, counts }: any) {
  return (
    <div className="flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] sm:inline-flex sm:w-auto">
      {items.map((item) => {
        const selected = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.value)}
            className={`inline-flex min-h-9 min-w-0 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition sm:min-h-8 sm:flex-none sm:px-3.5 ${selected ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'}`}
          >
            <span className="whitespace-nowrap">{item.label}</span>
            {counts && (
              <span className={selected ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-subtle)]'}>
                {counts[item.value] || 0}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function WriteForm({ onCancel, onSave }: any) {
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
            className="h-12 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 text-sm text-[var(--app-text)] outline-none transition focus:ring-2 focus:ring-[#0071e3]/24"
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
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3.5 font-bold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)]">
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
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="submit"
          disabled={saving || files.length === 0}
          className="apple-action-primary inline-flex min-h-10 items-center justify-center gap-2 px-5 text-sm disabled:opacity-50"
        >
          <FileUp size={15} />
          {saving ? '업로드 중...' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-1.5 px-4 text-sm"
        >
          <X size={14} />
          취소
        </button>
      </div>
    </form>
  )
}

export default function Archive({ onBack }: any) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detailFile, setDetailFile] = useState(null)
  const [mode, setMode] = useState('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')

  useScrollReveal([files.length, loading])

  const isAdmin = user?.role === 'ADMIN'

  const loadFiles = ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    listFiles()
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '자료실 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listFiles()
      .then((data) => { if (mounted) setFiles(Array.isArray(data) ? data : []) })
      .catch((err) => { if (mounted) setError(err.message || '자료실 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filteredFiles = useMemo(() => {
    const byCategory = activeCategory === 'ALL'
      ? files
      : files.filter((f) => (f.category || 'GENERAL') === activeCategory)
    if (!searchQuery.trim()) return byCategory
    const q = searchQuery.toLowerCase()
    return byCategory.filter((f) =>
      (f.title || f.originalName || '').toLowerCase().includes(q) ||
      richBodyToPlainText(f.description).toLowerCase().includes(q) ||
      (f.uploaderName || f.uploadedBy || '').toLowerCase().includes(q) ||
      categoryLabel(f.category || 'GENERAL').toLowerCase().includes(q)
    )
  }, [activeCategory, files, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: files.length,
      GENERAL: 0,
      ACADEMIC_JOURNAL: 0,
    }
    files.forEach((file) => {
      const category = file.category || 'GENERAL'
      counts[category] = (counts[category] || 0) + 1
    })
    return counts
  }, [files])

  const handleDelete = async (id) => {
    if (!window.confirm('자료를 삭제하시겠습니까?')) return
    setError('')
    setNotice('')
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
      if (detailFile?.id === id) {
        setDetailFile(null)
        setMode('list')
      }
      setNotice('자료가 삭제되었습니다.')
    } catch (err) {
      setError(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const openFile = (file) => {
    setDetailFile(file)
    setMode('detail')
  }

  const [voting, setVoting] = useState(false)
  const handleVote = async () => {
    if (!detailFile || voting) return
    setVoting(true)
    try {
      const updated = await voteArchiveFile(detailFile.id, detailFile.myVote === 1 ? 0 : 1)
      setDetailFile(updated)
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)))
    } catch (err) {
      setError(err.message || '추천 중 오류가 발생했습니다.')
    } finally {
      setVoting(false)
    }
  }

  const handleSave = (savedList, failedNames = []) => {
    const saved = Array.isArray(savedList) ? savedList : [savedList]
    setFiles((prev) => [...saved, ...prev])
    if (failedNames.length > 0) {
      setNotice('')
      setError(`${saved.length}개 자료가 등록되었습니다. 실패: ${failedNames.join(', ')}`)
    } else {
      setError('')
      setNotice(saved.length > 1 ? `${saved.length}개 자료가 등록되었습니다.` : '자료가 등록되었습니다.')
    }
    setMode('list')
  }

  const backToList = () => {
    setMode('list')
    setDetailFile(null)
  }

  return (
    <div className="w-full space-y-4 text-[var(--app-text)]">
      {mode === 'list' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="apple-detail-home-button w-full sm:w-auto"
          >
            <ArrowLeft size={14} />
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0" data-reveal>
              <p className="apple-eyebrow">Archive</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
                {mode === 'write' ? '자료 등록' : mode === 'detail' ? '자료 상세' : '자료실'}
              </h1>
              {mode === 'list' && (
                <p className="mt-2 text-sm font-bold text-[var(--app-accent-text)]">다시 찾는 자료실</p>
              )}
              <p className="apple-copy mt-3 max-w-2xl">
                {mode === 'list' ? '세미나, 프로젝트, 학술회지 자료를 카테고리와 검색으로 빠르게 다시 찾습니다.' : ''}
              </p>
            </div>
            {mode === 'list' ? (
              <button
                type="button"
                onClick={() => setMode('write')}
                className="apple-action-primary inline-flex min-h-10 items-center justify-center gap-2 px-5 text-sm"
              >
                <FileUp size={15} />
                자료 올리기
              </button>
            ) : (
              <button
                type="button"
                onClick={backToList}
                className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-2 px-4 text-sm"
              >
                <ArrowLeft size={15} />
                목록
              </button>
            )}
          </div>
        </div>

        {mode === 'write' && (
          <div className="bg-[var(--app-surface-soft)] p-5 sm:p-7">
            <WriteForm onCancel={backToList} onSave={handleSave} />
          </div>
        )}

        {mode === 'list' && (
          <>
            <div className="apple-control-strip flex flex-col gap-3 px-4 py-4 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
              <CategorySegment
                value={activeCategory}
                onChange={setActiveCategory}
                items={ARCHIVE_CATEGORIES}
                counts={categoryCounts}
              />
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex min-w-0 items-center">
                  <Search size={14} className="pointer-events-none absolute left-3 text-[var(--app-subtle)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="세미나, 프로젝트, 작성자 검색"
                    className="h-10 w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 pl-8 pr-3 text-sm text-[var(--app-text)] placeholder:text-[var(--app-subtle)] outline-none transition focus:ring-2 focus:ring-[#0071e3]/24 sm:w-64"
                  />
                </div>
                <div className="text-xs font-bold text-[var(--app-subtle)]">{filteredFiles.length}개</div>
              </div>
            </div>

            {notice && (
              <div className="mx-5 mt-5 rounded-lg border border-[#0071e3]/20 bg-[#e8f3ff] px-4 py-3 text-sm font-bold text-[#0066cc] sm:mx-7">
                {notice}
              </div>
            )}

            {error && (
              <div className="mx-5 mt-5 flex flex-col gap-3 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:mx-7 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => loadFiles()}
                  className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-sm"
                >
                  <RefreshCw size={15} />
                  다시 시도
                </button>
              </div>
            )}

            <div className="m-4 overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:m-7">
              {loading ? (
                <div className="flex min-h-[12rem] items-center justify-center px-5 py-12 text-center text-sm font-medium text-[var(--app-muted)] sm:min-h-[14rem]">자료를 불러오는 중...</div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex min-h-[12rem] items-center justify-center px-5 py-12 text-center text-sm font-medium text-[var(--app-muted)] sm:min-h-[14rem]">
                  {searchQuery ? '검색 결과가 없습니다.' : '등록된 자료가 없습니다.'}
                </div>
              ) : (
                <>
                <div className="grid gap-3 p-4 md:hidden">
                  {filteredFiles.map((file, index) => {
                    const open = () => openFile(file)
                    return (
                      <article key={file.id} className="apple-soft-panel p-4" data-reveal style={{ '--reveal-delay': `${index * 70}ms` } as any}>
                        <button
                          type="button"
                          onClick={open}
                          className="block w-full text-left focus:outline-none"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-accent-text)]">
                              {categoryLabel(file.category || 'GENERAL')}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] font-bold text-[var(--app-subtle)]">{formatSize(file.fileSize)}</span>
                          </span>
                          <span className="mt-3 block line-clamp-2 text-[15px] font-bold leading-6 text-[var(--app-text)]" title={file.title || file.originalName}>
                            {file.title || file.originalName}
                          </span>
                          {richBodyToPlainText(file.description) && (
                            <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">
                              {richBodyToPlainText(file.description)}
                            </span>
                          )}
                          <span className="mt-3 block truncate text-xs font-semibold text-[var(--app-subtle)]">
                            {file.uploaderName || file.uploadedBy || '-'} · {formatDate(file.uploadedAt)} · 조회 {file.viewCount ?? 0} · 개추 {file.upvotes ?? 0}
                          </span>
                        </button>
                        <div className="mt-4 flex justify-end border-t border-[var(--app-hairline)] pt-3">
                          <a
                            href={downloadUrl(file.id)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3.5 text-sm font-bold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-elevated)]"
                          >
                            <Download size={15} />
                            다운로드
                          </a>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="apple-table w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-[var(--app-hairline)]">
                      <tr>
                        <th className="w-16 px-4 py-3">번호</th>
                        <th className="w-28 px-4 py-3">카테고리</th>
                        <th className="px-4 py-3">제목</th>
                        <th className="w-28 px-4 py-3">크기</th>
                        <th className="w-28 px-4 py-3">작성자</th>
                        <th className="w-36 px-4 py-3">날짜</th>
                        <th className="w-28 px-4 py-3 text-right">동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-hairline)]">
                      {filteredFiles.map((file, index) => {
                        const open = () => openFile(file)
                        return (
                          <tr
                            key={file.id}
                            tabIndex={0}
                            role="button"
                            onClick={open}
                            onKeyDown={(event) => openRowWithKeyboard(event, open)}
                            className="cursor-pointer text-[var(--app-muted)] focus:outline-none"
                            data-reveal
                            style={{ '--reveal-delay': `${index * 70}ms` } as any}
                          >
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-[var(--app-subtle)]">{file.id}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                              <span className="inline-flex rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent-text)]">
                                {categoryLabel(file.category || 'GENERAL')}
                              </span>
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                              <span className="block max-w-[340px] truncate font-bold text-[var(--app-text)]" title={file.title || file.originalName}>
                                {file.title || file.originalName}
                              </span>
                              {richBodyToPlainText(file.description) && (
                                <span className="mt-0.5 block max-w-[340px] truncate text-xs text-[var(--app-subtle)]">
                                  {richBodyToPlainText(file.description)}
                                </span>
                              )}
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{formatSize(file.fileSize)}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">{file.uploaderName || file.uploadedBy || '-'}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                              <span className="block">{formatDate(file.uploadedAt)}</span>
                              <span className="mt-0.5 block text-xs text-[var(--app-subtle)]">조회 {file.viewCount ?? 0} · 개추 {file.upvotes ?? 0}</span>
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <a
                                  href={downloadUrl(file.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 font-bold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-elevated)]"
                                >
                                  <Download size={15} />
                                  다운로드
                                </a>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </>
        )}

        {mode === 'detail' && detailFile && (
          <div className="m-5 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-5 text-[var(--app-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:m-7 sm:p-7">
            <div className="border-b border-[var(--app-hairline)] pb-5">
              <p className="apple-eyebrow">Archive</p>
              <h2 className="mt-3 break-words text-2xl font-bold text-[var(--app-text)]">{detailFile.title || detailFile.originalName}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--app-subtle)]">
                <span className="rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 font-bold text-[var(--app-accent-text)]">{categoryLabel(detailFile.category || 'GENERAL')}</span>
                <span>{detailFile.uploaderName || detailFile.uploadedBy || '-'} · {formatDate(detailFile.uploadedAt)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-subtle)]">
                <span>조회 {detailFile.viewCount ?? 0}</span>
                <span>개추 {detailFile.upvotes ?? 0}</span>
              </div>
            </div>
            {detailFile.description && (
              <div className="border-b border-[var(--app-hairline)] py-5 text-sm leading-7 text-[var(--app-muted)]">
                {renderRichBody(
                  detailFile.description,
                  (plain) => <p className="whitespace-pre-wrap">{plain}</p>,
                )}
              </div>
            )}
            <dl className="grid gap-4 border-b border-[var(--app-hairline)] py-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-bold text-[var(--app-subtle)]">파일명</dt>
                <dd className="mt-1 break-all font-bold text-[var(--app-text)]">{detailFile.originalName}</dd>
              </div>
              <div>
                <dt className="font-bold text-[var(--app-subtle)]">크기</dt>
                <dd className="mt-1 font-bold text-[var(--app-text)]">{formatSize(detailFile.fileSize)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={downloadUrl(detailFile.id)}
                className="apple-action-primary inline-flex min-h-10 items-center justify-center gap-2 px-4 text-sm"
              >
                <Download size={15} />
                다운로드
              </a>
              <button
                type="button"
                onClick={handleVote}
                disabled={voting}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-bold disabled:opacity-50 ${detailFile.myVote === 1 ? 'border-[#0071e3] bg-[var(--app-accent)] text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'}`}
              >
                <ThumbsUp size={15} />
                개추 {detailFile.upvotes ?? 0}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(detailFile.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 transition hover:bg-red-100"
                >
                  <Trash2 size={15} />
                  삭제
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
