import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { listNotices, createNotice, updateNotice, deleteNotice } from '../services/noticeApi.js'
import { useAuth } from '../contexts/useAuth.js'

function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ko-KR')
}

function NoticeForm({ initialNotice, defaultCategory, user, onCancel, onSave }) {
  const [formData, setFormData] = useState({
    title: initialNotice?.title || '',
    content: initialNotice?.content || '',
    pinned: initialNotice?.pinned || false,
    category: initialNotice?.category || defaultCategory || 'GENERAL',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return
    setSaving(true)
    try {
      const body = { ...formData, author: user.name }
      const saved = initialNotice
        ? await updateNotice(initialNotice.id, body)
        : await createNotice(body)
      onSave(saved)
    } catch (err) {
      alert(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 border border-black/10 bg-white/55 p-4">
      <input
        value={formData.title}
        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
        placeholder="제목"
        className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <textarea
        value={formData.content}
        onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
        placeholder="내용"
        rows={14}
        className="w-full resize-y border border-black/15 bg-white px-3 py-2 text-sm leading-7 text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={formData.category}
          onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
          className="border border-black/15 bg-white px-3 py-2 text-sm font-semibold"
        >
          <option value="GENERAL">공지</option>
          <option value="JOB">취업공고</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--theme-body-muted)]">
          <input
            type="checkbox"
            checked={formData.pinned}
            onChange={(e) => setFormData((p) => ({ ...p, pinned: e.target.checked }))}
          />
          고정
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="bg-[var(--theme-text)] px-4 py-2 text-sm font-bold text-[var(--theme-bg)] disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="border border-black/15 bg-white px-4 py-2 text-sm font-bold">
          취소
        </button>
      </div>
    </div>
  )
}

export default function Notices({ onBack }) {
  const { user } = useAuth()
  const [notices, setNotices] = useState([])
  const [mode, setMode] = useState('list')
  const [selectedNotice, setSelectedNotice] = useState(null)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isAdmin = user?.role === 'ADMIN'

  const load = ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    listNotices()
      .then((data) => setNotices(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '공지사항을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listNotices()
      .then((data) => { if (mounted) setNotices(Array.isArray(data) ? data : []) })
      .catch((err) => { if (mounted) setError(err.message || '공지사항을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filteredNotices = useMemo(() => (
    activeCategory === 'ALL'
      ? notices
      : notices.filter((notice) => (notice.category || 'GENERAL') === activeCategory)
  ), [activeCategory, notices])

  const mergeNotice = (notice) => {
    setNotices((prev) => {
      const exists = prev.some((item) => item.id === notice.id)
      if (!exists) return [notice, ...prev]
      return prev.map((item) => (item.id === notice.id ? notice : item))
    })
    setSelectedNotice(notice)
    setMode('detail')
  }

  const deleteSelected = async () => {
    if (!selectedNotice || !window.confirm('공지사항을 삭제하시겠습니까?')) return
    try {
      await deleteNotice(selectedNotice.id)
      setNotices((prev) => prev.filter((notice) => notice.id !== selectedNotice.id))
      setSelectedNotice(null)
      setMode('list')
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const headerTitle = mode === 'write' ? '공지 작성' : mode === 'edit' ? '공지 수정' : '공지사항'

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={onBack} className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white">
          메인으로 돌아가기
        </button>
      </div>

      <section className="overflow-hidden border border-black/20 bg-[#f7f7f7] text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <div className="border-b border-black/20 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--theme-body-muted)]">Notice</p>
              <h1 className="mt-1 text-2xl font-black">{headerTitle}</h1>
            </div>
            {mode === 'list' ? (
              isAdmin && <button type="button" onClick={() => setMode('write')} className="bg-[#3b4890] px-4 py-2 text-sm font-bold text-white">공지 작성</button>
            ) : (
              <button type="button" onClick={() => setMode('list')} className="inline-flex items-center gap-1 border border-black/20 bg-white px-3 py-2 text-sm font-bold">
                <ArrowLeft size={14} />
                목록
              </button>
            )}
          </div>
        </div>

        {mode === 'list' && (
          <>
            <div className="flex flex-wrap gap-1 border-b border-black/15 bg-[#f1f3f8] px-3 py-2 text-xs font-bold">
              {[
                ['ALL', '전체'],
                ['GENERAL', '공지'],
                ['JOB', '취업공고'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveCategory(value)}
                  className={activeCategory === value ? 'bg-white px-3 py-1 text-[#3b4890]' : 'px-3 py-1 text-[var(--theme-body-muted)]'}
                >
                  {label}
                </button>
              ))}
            </div>
            {loading && <p className="px-4 py-12 text-center text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>}
            {error && <p className="px-4 py-3 text-sm text-red-500">{error}</p>}
            {!loading && !error && filteredNotices.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-[var(--theme-body-muted)]">등록된 글이 없습니다.</p>
            )}
            {!loading && !error && filteredNotices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="border-b border-[#29367c] bg-white text-xs">
                    <tr>
                      <th className="w-20 px-2 py-2">번호</th>
                      <th className="w-24 px-2 py-2">분류</th>
                      <th className="px-2 py-2 text-left">제목</th>
                      <th className="w-28 px-2 py-2">작성자</th>
                      <th className="w-24 px-2 py-2">작성일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10 bg-white">
                    {filteredNotices.map((notice) => (
                      <tr key={notice.id} className="hover:bg-[#f8f8f8]">
                        <td className="px-2 py-2 text-center text-xs text-[var(--theme-body-muted)]">{notice.id}</td>
                        <td className="px-2 py-2 text-center text-xs text-[#3b4890]">{(notice.category || 'GENERAL') === 'JOB' ? '취업' : '공지'}</td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => { setSelectedNotice(notice); setMode('detail') }} className="max-w-[440px] truncate text-left font-semibold hover:underline">
                            {notice.pinned && <span className="mr-1 text-red-600">[고정]</span>}
                            {notice.title}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-center text-xs">{notice.author}</td>
                        <td className="px-2 py-2 text-center text-xs text-[var(--theme-body-muted)]">{formatDate(notice.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {mode === 'write' && (
          <div className="p-4">
            <NoticeForm
              user={user}
              defaultCategory={activeCategory === 'JOB' ? 'JOB' : 'GENERAL'}
              onCancel={() => setMode('list')}
              onSave={(notice) => { mergeNotice(notice); load({ showLoading: false }) }}
            />
          </div>
        )}

        {mode === 'edit' && selectedNotice && (
          <div className="p-4">
            <NoticeForm
              initialNotice={selectedNotice}
              user={user}
              onCancel={() => setMode('detail')}
              onSave={(notice) => { mergeNotice(notice); load({ showLoading: false }) }}
            />
          </div>
        )}

        {mode === 'detail' && selectedNotice && (
          <article className="bg-white">
            <div className="border-b border-black/10 px-4 py-3">
              <div className="mb-2 text-xs font-bold text-[#3b4890]">{(selectedNotice.category || 'GENERAL') === 'JOB' ? '취업공고' : '공지'}</div>
              <h2 className="break-words text-xl font-black">
                {selectedNotice.pinned && <span className="mr-2 text-red-600">[고정]</span>}
                {selectedNotice.title}
              </h2>
              <p className="mt-2 text-xs text-[var(--theme-body-muted)]">
                작성자 {selectedNotice.author} · {new Date(selectedNotice.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>
            <div className="min-h-[320px] whitespace-pre-wrap px-4 py-6 text-[15px] leading-8">{selectedNotice.content}</div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-black/10 px-4 py-4">
              <button type="button" onClick={() => setMode('list')} className="border border-black/15 bg-white px-4 py-2 text-sm font-bold">
                목록
              </button>
              {isAdmin && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('edit')} className="inline-flex items-center gap-1 border border-black/15 bg-white px-4 py-2 text-sm font-bold">
                    <Pencil size={14} />
                    수정
                  </button>
                  <button type="button" onClick={deleteSelected} className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600">
                    <Trash2 size={14} />
                    삭제
                  </button>
                </div>
              )}
            </div>
          </article>
        )}
      </section>
    </div>
  )
}
