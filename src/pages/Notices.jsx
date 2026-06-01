import { useEffect, useState } from 'react'
import { listNotices, createNotice, updateNotice, deleteNotice } from '../services/noticeApi.js'
import { useAuth } from '../contexts/useAuth.js'

export default function Notices({ onBack }) {
  const { user } = useAuth()
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [formData, setFormData] = useState({ title: '', content: '', pinned: false })
  const [saving, setSaving] = useState(false)

  const isAdmin = user?.role === 'ADMIN'

  const load = () => {
    setLoading(true)
    listNotices()
      .then(setNotices)
      .catch((err) => setError(err.message || '공지사항을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openCreate = () => {
    setEditTarget(null)
    setFormData({ title: '', content: '', pinned: false })
    setShowForm(true)
  }

  const openEdit = (notice) => {
    setEditTarget(notice)
    setFormData({ title: notice.title, content: notice.content, pinned: notice.pinned })
    setShowForm(true)
    setExpandedId(null)
  }

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return
    setSaving(true)
    try {
      const body = { ...formData, author: user.name }
      if (editTarget) {
        await updateNotice(editTarget.id, body)
      } else {
        await createNotice(body)
      }
      setShowForm(false)
      load()
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('공지사항을 삭제하시겠습니까?')) return
    try {
      await deleteNotice(id)
      setNotices((prev) => prev.filter((n) => n.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('ko-KR')

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-white"
        >
          메인으로 돌아가기
        </button>
      </div>

      <div className="shape-cut bg-[var(--theme-surface-70)] p-px shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <section className="shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--theme-body-muted)]/80">Notice</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">공지사항</h1>
            </div>
            {isAdmin && !showForm && (
              <button
                type="button"
                onClick={openCreate}
                className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90"
              >
                공지 작성
              </button>
            )}
          </div>

          {showForm && (
            <div className="mb-6 space-y-3 rounded-lg border border-black/10 bg-black/5 p-4">
              <input
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="제목"
                className="w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
              />
              <textarea
                value={formData.content}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                placeholder="내용"
                rows={5}
                className="w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55 resize-none"
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--theme-body-muted)]">
                <input
                  type="checkbox"
                  checked={formData.pinned}
                  onChange={(e) => setFormData((p) => ({ ...p, pinned: e.target.checked }))}
                />
                고정 공지
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="shape-cut-sm border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {loading && <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && notices.length === 0 && (
            <p className="rounded-lg border border-black/10 bg-black/5 px-4 py-5 text-sm text-[var(--theme-body-muted)]">
              등록된 공지사항이 없습니다.
            </p>
          )}

          {!loading && !error && notices.length > 0 && (
            <div className="space-y-2">
              {notices.map((notice) => (
                <div key={notice.id} className="overflow-hidden rounded-lg border border-black/10 bg-black/5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-black/5"
                  >
                    <span className="flex flex-1 items-center gap-2 font-semibold text-[var(--theme-body-dark)]">
                      {notice.pinned && (
                        <span className="shrink-0 rounded bg-cyan-100 px-1.5 py-0.5 text-xs font-bold text-cyan-700">
                          고정
                        </span>
                      )}
                      {notice.title}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--theme-body-muted)]">
                      {formatDate(notice.createdAt)}
                    </span>
                  </button>
                  {expandedId === notice.id && (
                    <div className="border-t border-black/10 px-4 py-4">
                      <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--theme-body-mid)]">
                        {notice.content}
                      </p>
                      <p className="mt-3 text-xs text-[var(--theme-body-muted)]">작성자: {notice.author}</p>
                      {isAdmin && (
                        <div className="mt-3 flex gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(notice)}
                            className="text-xs font-semibold text-blue-500 transition hover:underline"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(notice.id)}
                            className="text-xs font-semibold text-red-500 transition hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
