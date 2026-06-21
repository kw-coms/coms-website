import { useEffect, useRef, useState } from 'react'
import {
  createClubActivity,
  deleteClubActivity,
  listClubActivities,
  listClubActivityCategories,
  uploadClubActivityFile,
  uploadClubActivityImages,
} from '../../services/clubActivityApi.js'
import AdminActivityCategories from './AdminActivityCategories.jsx'
import AdminActivityRow from './AdminActivityRow.jsx'

const ADMIN_INPUT_CLASS = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

export default function AdminActivities() {
  const imageInputRef = useRef(null)
  const filesInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    kind: 'ACTIVITY',
    category: '',
    title: '',
    description: '',
    eventDate: '',
    image: null,
    images: [],
    files: [],
  })

  const loadActivities = () => {
    setError('')
    listClubActivities()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '활동 기록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    listClubActivityCategories()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch(() => {})
  }

  useEffect(() => {
    let mounted = true
    Promise.all([listClubActivities(), listClubActivityCategories()])
      .then(([activityData, categoryData]) => {
        if (!mounted) return
        setItems(Array.isArray(activityData) ? activityData : [])
        const list = Array.isArray(categoryData) ? categoryData : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch((err) => { if (mounted) setError(err.message || '활동 기록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.eventDate) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const created = await createClubActivity({
        kind: form.kind,
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim(),
        eventDate: form.eventDate,
        image: form.image,
      })
      if (form.kind === 'ACTIVITY' && form.images.length > 0) {
        await uploadClubActivityImages(created.id, form.images)
      }
      if (form.kind === 'ACTIVITY' && form.files.length > 0) {
        for (const file of form.files) {
          await uploadClubActivityFile(created.id, file)
        }
      }
      // Re-fetch the list so the new media counts are reflected.
      if (form.images.length > 0 || form.files.length > 0) {
        const refreshed = await listClubActivities()
        setItems(Array.isArray(refreshed) ? refreshed : [])
      } else {
        setItems((prev) => [created, ...prev])
      }
      setNotice('활동 기록을 등록했습니다.')
      event.currentTarget.reset()
      if (imageInputRef.current) imageInputRef.current.value = ''
      if (filesInputRef.current) filesInputRef.current.value = ''
      setForm((prev) => ({ ...prev, title: '', description: '', eventDate: '', image: null, images: [], files: [] }))
    } catch (err) {
      setError(err.message || '활동 기록 등록 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`${item.title} 기록을 삭제하시겠습니까?`)) return
    try {
      await deleteClubActivity(item.id)
      setItems((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch (err) {
      alert(err.message || '활동 기록을 삭제하지 못했습니다.')
    }
  }

  const handleUpdated = (updated) => {
    setItems((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)))
  }

  const inputClass = ADMIN_INPUT_CLASS

  return (
    <div className="space-y-8">
      <AdminActivityCategories
        categories={categories}
        onChanged={() => { loadCategories(); loadActivities() }}
      />

      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">활동 기록 등록</p>
        <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">회원에게만 보이는 실제 활동 기록과 일정을 등록합니다. 사진 여러 장과 파일 첨부를 함께 올릴 수 있습니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 제목
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 날짜
            <input
              type="date"
              value={form.eventDate}
              onChange={(event) => setForm((prev) => ({ ...prev, eventDate: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 종류
            <select
              value={form.kind}
              onChange={(event) => {
                if (event.target.value === 'SCHEDULE') {
                  if (imageInputRef.current) imageInputRef.current.value = ''
                  if (filesInputRef.current) filesInputRef.current.value = ''
                }
                setForm((prev) => ({
                  ...prev,
                  kind: event.target.value,
                  image: event.target.value === 'SCHEDULE' ? null : prev.image,
                  images: event.target.value === 'SCHEDULE' ? [] : prev.images,
                  files: event.target.value === 'SCHEDULE' ? [] : prev.files,
                }))
              }}
              className={inputClass}
            >
              <option value="ACTIVITY">활동 기록</option>
              <option value="SCHEDULE">일정</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 분류
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className={inputClass}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            활동 내용
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className={inputClass}
            />
          </label>
          {form.kind === 'ACTIVITY' && (
            <>
              <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
                활동 사진 (여러 장 선택 가능)
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => setForm((prev) => ({ ...prev, images: Array.from(event.target.files || []) }))}
                  className="text-sm text-[var(--theme-body-dark)]"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
                파일 첨부 (여러 개 선택 가능)
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  onChange={(event) => setForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))}
                  className="text-sm text-[var(--theme-body-dark)]"
                />
              </label>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.eventDate}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
          >
            {saving ? '등록 중...' : '활동 등록'}
          </button>
          <button
            type="button"
            onClick={() => { setLoading(true); loadActivities() }}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>
        {notice && <p className="mt-2 text-xs font-semibold text-[var(--app-accent-text)]">{notice}</p>}
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">활동 기록을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 활동 기록이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AdminActivityRow
              key={item.id}
              item={item}
              categories={categories}
              onDelete={handleDelete}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
