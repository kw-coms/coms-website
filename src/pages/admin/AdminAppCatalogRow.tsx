import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { apiUrl } from '../../services/apiClient'
import {
  deleteClubProjectFile,
  listClubProjects,
  updateClubProject,
  uploadClubProjectFile,
} from '../../services/clubProjectApi'
import AppProjectCard from '../../components/apps/AppProjectCard'

const ADMIN_INPUT_CLASS = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'
type MediaInfo = { id: string | number; url?: string; originalName?: string }
type ProjectItem = {
  id: string | number
  category?: string
  categoryName?: string
  title?: string
  eyebrow?: string
  description?: string
  madeBy?: string
  linkUrl?: string
  displayUrl?: string
  files?: MediaInfo[]
}

export default function AdminAppCatalogRow({ item, categories, onDelete, onUpdated }: {
  item: ProjectItem
  categories: { key?: string; name: string }[]
  onDelete: (item: ProjectItem) => void
  onUpdated: (updated: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState('')
  const fileInputRef = useRef(null)
  const [draft, setDraft] = useState({
    category: item.category,
    title: item.title,
    eyebrow: item.eyebrow || '',
    description: item.description || '',
    madeBy: item.madeBy || '최준혁',
    linkUrl: item.linkUrl || '',
    displayUrl: item.displayUrl || '',
  })

  const startEdit = () => {
    setDraft({
      category: item.category,
      title: item.title,
      eyebrow: item.eyebrow || '',
      description: item.description || '',
      madeBy: item.madeBy || '최준혁',
      linkUrl: item.linkUrl || '',
      displayUrl: item.displayUrl || '',
    })
    setRowError('')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!draft.title.trim() || !draft.category) return
    setBusy(true)
    setRowError('')
    try {
      const updated = await updateClubProject(item.id, {
        category: draft.category,
        title: draft.title.trim(),
        eyebrow: draft.eyebrow,
        description: draft.description,
        madeBy: draft.madeBy.trim() || '최준혁',
        linkUrl: draft.linkUrl,
        displayUrl: draft.displayUrl,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setRowError(err.message || 'Apps 항목을 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const refreshFromServer = async () => {
    const list = await listClubProjects()
    const refreshed = (Array.isArray(list) ? list : []).find((entry) => entry.id === item.id)
    if (refreshed) onUpdated(refreshed)
  }

  const addFile = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setBusy(true)
    setRowError('')
    try {
      for (const file of files) {
        await uploadClubProjectFile(item.id, file)
      }
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 추가하지 못했습니다.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeFile = async (fileId) => {
    setBusy(true)
    setRowError('')
    try {
      await deleteClubProjectFile(item.id, fileId)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const categoryName = categories.find((category) => category.key === item.category)?.name || item.categoryName || item.category

  return (
    <article className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--theme-body-dark)]">{item.title}</p>
          <p className="text-xs text-[var(--theme-body-muted)]">
            {categoryName} · 만든 사람 {item.madeBy || '최준혁'}
            {item.linkUrl && ' · 링크 있음'}
            {(item.files?.length ?? 0) > 0 && ` · 파일 ${item.files.length}개`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="text-xs font-semibold text-[var(--app-accent-text)] transition hover:underline"
          >
            {editing ? '닫기' : '수정'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="text-xs font-semibold text-red-500 transition hover:underline"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="mt-3" data-testid={`admin-app-preview-${item.id}`}>
        <AppProjectCard
          project={{ ...item, categoryName }}
          showStatusBadges
          interactive={false}
          className="min-h-0"
        />
      </div>

      {editing && (
        <div className="mt-3 grid gap-3 border-t border-[var(--app-hairline)] pt-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            제목
            <input
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            분류
            <select
              value={draft.category}
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            짧은 태그
            <input
              value={draft.eyebrow}
              onChange={(event) => setDraft((prev) => ({ ...prev, eyebrow: event.target.value }))}
              maxLength={60}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            만든 사람
            <input
              value={draft.madeBy}
              onChange={(event) => setDraft((prev) => ({ ...prev, madeBy: event.target.value }))}
              maxLength={100}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            링크 URL
            <input
              value={draft.linkUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, linkUrl: event.target.value }))}
              maxLength={500}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            표시 주소
            <input
              value={draft.displayUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, displayUrl: event.target.value }))}
              maxLength={255}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            설명
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className={ADMIN_INPUT_CLASS}
            />
          </label>

          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-[var(--theme-body-muted)]">배포 파일</p>
            <ul className="mt-2 flex flex-col gap-1">
              {(item.files || []).map((file) => (
                <li key={file.id} className="flex items-center gap-2 text-xs">
                  <a href={apiUrl(file.url)} className="font-semibold text-[var(--app-accent-text)] hover:underline">{file.originalName || '배포파일'}</a>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    disabled={busy}
                    className="font-semibold text-red-500 hover:underline disabled:opacity-50"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <input
              ref={fileInputRef}
              aria-label={`${item.title} 배포 파일 추가`}
              type="file"
              multiple
              onChange={addFile}
              disabled={busy}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="shape-cut-sm mt-2 inline-flex items-center gap-2 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white disabled:opacity-50"
            >
              <Upload size={13} aria-hidden="true" />
              파일 추가
            </button>
          </div>

          {rowError && <p className="text-xs font-semibold text-red-600 md:col-span-2">{rowError}</p>}

          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy || !draft.title.trim() || !draft.category}
              className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
            >
              {busy ? '저장 중...' : '변경 저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

// Admin CRUD for the DB-backed project categories.
