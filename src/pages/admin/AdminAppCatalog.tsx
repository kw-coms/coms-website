import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import {
  createClubProject,
  deleteClubProject,
  listClubProjectCategories,
  listClubProjects,
  uploadClubProjectFile,
} from '../../services/clubProjectApi'
import AppProjectCard from '../../components/apps/AppProjectCard'
import AdminAppCatalogRow from './AdminAppCatalogRow'
import AdminAppCategories from './AdminAppCategories'

const ADMIN_INPUT_CLASS = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

function formatFileSize(size) {
  if (!size && size !== 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
export default function AdminAppCatalog() {
  const fileInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    category: '',
    title: '',
    eyebrow: '',
    description: '',
    madeBy: '최준혁',
    linkUrl: '',
    displayUrl: '',
    files: [],
  })

  const loadProjects = () => {
    setError('')
    listClubProjects()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Apps 항목을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    listClubProjectCategories()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch(() => {})
  }

  useEffect(() => {
    let mounted = true
    Promise.all([listClubProjects(), listClubProjectCategories()])
      .then(([projectData, categoryData]) => {
        if (!mounted) return
        setItems(Array.isArray(projectData) ? projectData : [])
        const list = Array.isArray(categoryData) ? categoryData : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch((err) => { if (mounted) setError(err.message || 'Apps 항목을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.category) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const created = await createClubProject({
        category: form.category,
        title: form.title.trim(),
        eyebrow: form.eyebrow.trim(),
        description: form.description.trim(),
        madeBy: form.madeBy.trim() || '최준혁',
        linkUrl: form.linkUrl.trim(),
        displayUrl: form.displayUrl.trim(),
      })
      if (form.files.length > 0) {
        for (const file of form.files) {
          await uploadClubProjectFile(created.id, file)
        }
        const refreshed = await listClubProjects()
        setItems(Array.isArray(refreshed) ? refreshed : [])
      } else {
        setItems((prev) => [...prev, created])
      }
      setNotice('Apps 항목을 등록했습니다.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setForm((prev) => ({ ...prev, title: '', eyebrow: '', description: '', linkUrl: '', displayUrl: '', files: [] }))
    } catch (err) {
      setError(err.message || 'Apps 항목 등록 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`${item.title} Apps 항목을 삭제하시겠습니까?`)) return
    try {
      await deleteClubProject(item.id)
      setItems((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch (err) {
      alert(err.message || 'Apps 항목을 삭제하지 못했습니다.')
    }
  }

  const handleUpdated = (updated) => {
    setItems((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)))
  }

  const draftCategoryName = categories.find((category) => category.key === form.category)?.name || form.category
  const draftProject = {
    id: 'draft',
    category: form.category,
    categoryName: draftCategoryName,
    title: form.title.trim(),
    eyebrow: form.eyebrow.trim(),
    description: form.description.trim(),
    madeBy: form.madeBy.trim() || '최준혁',
    linkUrl: form.linkUrl.trim(),
    displayUrl: form.displayUrl.trim(),
    files: form.files.map((file, index) => ({
      id: `draft-file-${index}`,
      url: '#',
      originalName: file.name,
      fileSize: file.size,
    })),
  }

  return (
    <div className="space-y-8">
      <AdminAppCategories
        categories={categories}
        onChanged={() => { loadCategories(); loadProjects() }}
      />

      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">Apps 항목 등록</p>
        <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">COM&apos;s Apps에 노출할 웹사이트·앱·게임을 등록합니다. 외부 링크와 배포 파일(apk/zip)을 함께 또는 따로 추가할 수 있습니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            제목
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            분류
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            짧은 태그 (선택)
            <input
              value={form.eyebrow}
              onChange={(event) => setForm((prev) => ({ ...prev, eyebrow: event.target.value }))}
              maxLength={60}
              placeholder="예: Worldcup"
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            만든 사람
            <input
              value={form.madeBy}
              onChange={(event) => setForm((prev) => ({ ...prev, madeBy: event.target.value }))}
              maxLength={100}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            링크 URL (선택)
            <input
              value={form.linkUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, linkUrl: event.target.value }))}
              maxLength={500}
              placeholder="https://..."
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            표시 주소 (선택)
            <input
              value={form.displayUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, displayUrl: event.target.value }))}
              maxLength={255}
              placeholder="예: coms.kw.ac.kr/worldcup"
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            설명
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <div className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            <span>배포 파일 (apk/zip 등, 여러 개 선택 가능)</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shape-cut-sm inline-flex items-center gap-2 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white"
              >
                <Upload size={14} aria-hidden="true" />
                파일 선택
              </button>
              <span className="text-xs font-semibold text-[var(--theme-body-muted)]">
                {form.files.length > 0 ? `${form.files.length}개 선택됨` : '선택된 파일 없음'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              aria-label="배포 파일 (apk/zip 등, 여러 개 선택 가능)"
              type="file"
              multiple
              onChange={(event) => setForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))}
              className="hidden"
            />
          </div>
          {form.files.length > 0 && (
            <div className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-3 md:col-span-2" aria-label="선택한 Apps 배포 파일">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--theme-body-dark)]">선택한 파일 {form.files.length}개</p>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, files: [] }))
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-xs font-semibold text-red-500 hover:underline"
                >
                  전체 삭제
                </button>
              </div>
              <ul className="mt-2 grid gap-1">
                {form.files.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-[var(--theme-body-dark)]">{file.name}</span>
                    <span className="shrink-0 text-[var(--theme-body-muted)]">{formatFileSize(file.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-[var(--app-hairline)] bg-white/60 p-3">
          <p className="text-xs font-bold text-[var(--theme-body-dark)]">공개 카드 미리보기</p>
          <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">Apps 페이지와 같은 카드 형태로 노출 상태를 확인합니다.</p>
          <AppProjectCard
            project={draftProject}
            showStatusBadges
            interactive={false}
            testId="admin-app-preview-draft"
            className="mt-3"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.category}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
          >
            {saving ? '등록 중...' : 'Apps 항목 등록'}
          </button>
          <button
            type="button"
            onClick={() => { setLoading(true); loadProjects() }}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>
        {notice && <p className="mt-2 text-xs font-semibold text-[var(--app-accent-text)]">{notice}</p>}
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">Apps 항목을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 Apps 항목이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AdminAppCatalogRow
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
