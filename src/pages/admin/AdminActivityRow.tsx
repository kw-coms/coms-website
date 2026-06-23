import { useRef, useState } from 'react'
import {
  deleteClubActivityFile,
  deleteClubActivityImage,
  listClubActivities,
  updateClubActivity,
  uploadClubActivityFile,
  uploadClubActivityImages,
} from '../../services/clubActivityApi'

const ADMIN_INPUT_CLASS = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

export default function AdminActivityRow({ item, categories, onDelete, onUpdated }: any) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState('')
  const [draft, setDraft] = useState({
    category: item.category,
    title: item.title,
    description: item.description || '',
    eventDate: item.eventDate || '',
  })
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const startEdit = () => {
    setDraft({
      category: item.category,
      title: item.title,
      description: item.description || '',
      eventDate: item.eventDate || '',
    })
    setRowError('')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!draft.title.trim() || !draft.eventDate) return
    setBusy(true)
    setRowError('')
    try {
      const updated = await updateClubActivity(item.id, {
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description,
        eventDate: draft.eventDate,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setRowError(err.message || '활동 기록을 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const refreshFromServer = async () => {
    const list = await listClubActivities()
    const refreshed = (Array.isArray(list) ? list : []).find((entry) => entry.id === item.id)
    if (refreshed) onUpdated(refreshed)
  }

  const addImages = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setBusy(true)
    setRowError('')
    try {
      await uploadClubActivityImages(item.id, files)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '사진을 추가하지 못했습니다.')
    } finally {
      setBusy(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const addFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setRowError('')
    try {
      await uploadClubActivityFile(item.id, file)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 추가하지 못했습니다.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeImage = async (imageId) => {
    setBusy(true)
    setRowError('')
    try {
      await deleteClubActivityImage(item.id, imageId)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '사진을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeFile = async (fileId) => {
    setBusy(true)
    setRowError('')
    try {
      await deleteClubActivityFile(item.id, fileId)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const categoryName = categories.find((category) => category.key === item.category)?.name || item.categoryName || item.category
  const isActivity = item.kind !== 'SCHEDULE'

  return (
    <article className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--theme-body-dark)]">{item.title}</p>
          <p className="text-xs text-[var(--theme-body-muted)]">
            {item.kind === 'SCHEDULE' ? '일정' : '활동'} · {categoryName} · {item.eventDate}
            {(item.imageInfos?.length ?? 0) > 0 && ` · 사진 ${item.imageInfos.length}장`}
            {(item.fileInfos?.length ?? 0) > 0 && ` · 첨부 ${item.fileInfos.length}개`}
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

      {editing && (
        <div className="mt-3 grid gap-3 border-t border-[var(--app-hairline)] pt-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 제목
            <input
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 날짜
            <input
              type="date"
              value={draft.eventDate}
              onChange={(event) => setDraft((prev) => ({ ...prev, eventDate: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 분류
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
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            활동 내용
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className={ADMIN_INPUT_CLASS}
            />
          </label>

          {isActivity && (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-[var(--theme-body-muted)]">사진</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(item.imageInfos || []).map((image) => (
                  <div key={image.id} className="relative">
                    <img src={image.url} alt="" className="h-16 w-16 rounded object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      disabled={busy}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white disabled:opacity-50"
                      aria-label="사진 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={addImages}
                disabled={busy}
                className="mt-2 text-sm text-[var(--theme-body-dark)]"
              />
            </div>
          )}

          {isActivity && (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-[var(--theme-body-muted)]">파일 첨부</p>
              <ul className="mt-2 flex flex-col gap-1">
                {(item.fileInfos || []).map((file) => (
                  <li key={file.id} className="flex items-center gap-2 text-xs">
                    <a href={file.url} className="font-semibold text-[var(--app-accent-text)] hover:underline">{file.originalName || '첨부파일'}</a>
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
                type="file"
                onChange={addFile}
                disabled={busy}
                className="mt-2 text-sm text-[var(--theme-body-dark)]"
              />
            </div>
          )}

          {rowError && <p className="text-xs font-semibold text-red-600 md:col-span-2">{rowError}</p>}

          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy || !draft.title.trim() || !draft.eventDate}
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
