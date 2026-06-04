import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BriefcaseBusiness, Megaphone, Pencil, Search, Trash2 } from 'lucide-react'
import { listNotices, createNotice, updateNotice, deleteNotice } from '../services/noticeApi.js'
import { useAuth } from '../contexts/useAuth.js'

function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ko-KR')
}

function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

function clickableCell(open) {
  return {
    onClick: open,
  }
}

function NoticeForm({ initialNotice, defaultCategory, user, onCancel, onSave }) {
  const [formData, setFormData] = useState({
    title: initialNotice?.title || '',
    content: initialNotice?.content || '',
    category: initialNotice?.category || defaultCategory || 'GENERAL',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return
    setSaving(true)
    try {
      const body = { ...formData, pinned: false, author: user.name }
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
    <div className="space-y-4 rounded-lg border border-white/10 bg-white/82 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
      <input
        value={formData.title}
        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
        placeholder="제목"
        className="w-full rounded border border-black/15 bg-white px-4 py-3 text-sm text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <textarea
        value={formData.content}
        onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
        placeholder="내용"
        rows={14}
        className="w-full resize-y rounded border border-black/15 bg-white px-4 py-3 text-sm leading-7 text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={formData.category}
          onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
          className="rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold"
        >
          <option value="GENERAL">공지</option>
          <option value="JOB">취업공고</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="rounded bg-[var(--theme-text)] px-5 py-2.5 text-sm font-bold text-[var(--theme-bg)] disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-black/15 bg-white px-4 py-2.5 text-sm font-bold">
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
  const [searchQuery, setSearchQuery] = useState('')
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

  const filteredNotices = useMemo(() => {
    const byCategory = activeCategory === 'ALL'
      ? notices
      : notices.filter((notice) => (notice.category || 'GENERAL') === activeCategory)
    if (!searchQuery.trim()) return byCategory
    const q = searchQuery.toLowerCase()
    return byCategory.filter((notice) =>
      notice.title.toLowerCase().includes(q) ||
      (notice.content || '').toLowerCase().includes(q) ||
      (notice.author || '').toLowerCase().includes(q)
    )
  }, [activeCategory, notices, searchQuery])
  const featuredNotice = useMemo(
    () => notices.find((notice) => (notice.category || 'GENERAL') === 'GENERAL'),
    [notices],
  )
  const featuredJob = useMemo(
    () => notices.find((notice) => (notice.category || 'GENERAL') === 'JOB'),
    [notices],
  )

  const openNotice = (notice) => {
    setSelectedNotice(notice)
    setMode('detail')
  }

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
      {mode === 'list' && (
        <div className="flex justify-center sm:justify-start">
          <button type="button" onClick={onBack} className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="overflow-hidden shape-cut border border-white/10 bg-white/5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md">
        <div className="border-b border-white/10 bg-black/20 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">Notice</p>
              <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">{headerTitle}</h1>
              <p className="mt-2 text-sm leading-6 text-white/60">공지와 취업공고를 분리해서 확인합니다.</p>
            </div>
            {mode === 'list' ? (
              isAdmin && <button type="button" onClick={() => setMode('write')} className="shape-cut-sm bg-white/85 px-5 py-2.5 text-sm font-bold text-[var(--theme-body-dark)] transition hover:bg-white">공지 작성</button>
            ) : (
              <button type="button" onClick={() => setMode('list')} className="shape-cut-sm inline-flex items-center gap-1 border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white">
                <ArrowLeft size={14} />
                목록
              </button>
            )}
          </div>
        </div>

        {mode === 'list' && (
          <>
            {(featuredNotice || featuredJob) && (
              <div className="grid gap-3 border-b border-white/10 bg-white/8 px-5 py-4 sm:px-7 lg:grid-cols-2">
                {[
                  ['최신 공지', featuredNotice, Megaphone],
                  ['최신 취업공고', featuredJob, BriefcaseBusiness],
                ].map(([label, notice, Icon]) => (
                  notice && (
                    <button
                      key={label}
                      type="button"
                      onClick={() => openNotice(notice)}
                      className="shape-cut-sm group flex min-h-24 items-center gap-4 border border-white/10 bg-black/18 px-4 py-3 text-left transition hover:bg-white/12"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-black uppercase tracking-[0.18em] text-cyan-100">{label}</span>
                        <span className="mt-2 block truncate text-base font-black text-white group-hover:underline">{notice.title}</span>
                        <span className="mt-1 block text-xs font-semibold text-white/45">{formatDate(notice.createdAt)} · {notice.author}</span>
                      </span>
                    </button>
                  )
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/18 px-5 py-3 sm:px-7">
              <div className="flex flex-wrap gap-2 text-sm font-bold">
              {[
                ['ALL', '전체'],
                ['GENERAL', '공지'],
                ['JOB', '취업공고'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveCategory(value)}
                  className={`shape-cut-sm inline-flex items-center gap-2 px-4 py-2 transition ${
                    activeCategory === value
                      ? 'bg-white text-[var(--theme-body-dark)]'
                      : 'border border-white/10 bg-white/10 text-white/68 hover:bg-white/15'
                  }`}
                >
                  {value === 'JOB' ? <BriefcaseBusiness size={14} /> : <Megaphone size={14} />}
                  {label}
                </button>
              ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center">
                  <Search size={14} className="pointer-events-none absolute left-3 text-white/45" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="제목, 작성자 검색"
                    className="shape-cut-sm w-48 border border-white/10 bg-black/20 py-2 pl-8 pr-3 text-sm text-white placeholder-white/35 outline-none focus:border-white/25"
                  />
                </div>
                <span className="text-xs font-semibold text-white/45">{filteredNotices.length}개</span>
              </div>
            </div>
            {loading && <p className="px-4 py-16 text-center text-sm text-white/65">불러오는 중...</p>}
            {error && <p className="mx-5 mt-5 shape-cut-sm border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:mx-7">{error}</p>}
            {!loading && !error && filteredNotices.length === 0 && (
              <p className="px-4 py-16 text-center text-sm text-white/65">등록된 글이 없습니다.</p>
            )}
            {!loading && !error && filteredNotices.length > 0 && (
              <div className="m-5 overflow-hidden shape-cut-sm border border-white/10 bg-black/18 sm:m-7">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="border-b border-white/10 bg-white/8 text-xs uppercase tracking-[0.16em] text-white/45">
                    <tr>
                      <th className="w-20 px-4 py-3">번호</th>
                      <th className="w-28 px-4 py-3">분류</th>
                      <th className="px-4 py-3 text-left">제목</th>
                      <th className="w-32 px-4 py-3">작성자</th>
                      <th className="w-28 px-4 py-3">작성일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredNotices.map((notice) => {
                      const open = () => openNotice(notice)
                      return (
                      <tr
                        key={notice.id}
                        tabIndex={0}
                        role="button"
                        onClick={open}
                        onKeyDown={(event) => openRowWithKeyboard(event, open)}
                        className="cursor-pointer text-white/75 transition hover:bg-white/5 focus:bg-white/10 focus:outline-none"
                      >
                        <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-white/45">{notice.id}</td>
                        <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-bold text-cyan-100">{(notice.category || 'GENERAL') === 'JOB' ? '취업' : '공지'}</td>
                        <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                          <span className="block max-w-[520px] truncate text-left font-semibold text-white">
                            {notice.title}
                          </span>
                        </td>
                        <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{notice.author}</td>
                        <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-white/45">{formatDate(notice.createdAt)}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {mode === 'write' && (
          <div className="p-5 sm:p-7">
            <NoticeForm
              user={user}
              defaultCategory={activeCategory === 'JOB' ? 'JOB' : 'GENERAL'}
              onCancel={() => setMode('list')}
              onSave={(notice) => { mergeNotice(notice); load({ showLoading: false }) }}
            />
          </div>
        )}

        {mode === 'edit' && selectedNotice && (
          <div className="p-5 sm:p-7">
            <NoticeForm
              initialNotice={selectedNotice}
              user={user}
              onCancel={() => setMode('detail')}
              onSave={(notice) => { mergeNotice(notice); load({ showLoading: false }) }}
            />
          </div>
        )}

        {mode === 'detail' && selectedNotice && (
          <article className="m-5 overflow-hidden rounded-lg bg-white shadow-[0_18px_50px_rgba(0,0,0,0.14)] sm:m-7">
            <div className="border-b border-black/10 px-5 py-5">
              <div className="mb-2 text-xs font-bold text-[#3b4890]">{(selectedNotice.category || 'GENERAL') === 'JOB' ? '취업공고' : '공지'}</div>
              <h2 className="break-words text-2xl font-black">
                {selectedNotice.title}
              </h2>
              <p className="mt-3 text-xs text-[var(--theme-body-muted)]">
                작성자 {selectedNotice.author} · {new Date(selectedNotice.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>
            <div className="min-h-[360px] whitespace-pre-wrap px-5 py-7 text-[15px] leading-8">{selectedNotice.content}</div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-black/10 px-5 py-4">
              <button type="button" onClick={() => setMode('list')} className="rounded border border-black/15 bg-white px-4 py-2 text-sm font-bold">
                목록
              </button>
              {isAdmin && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('edit')} className="inline-flex items-center gap-1 rounded border border-black/15 bg-white px-4 py-2 text-sm font-bold">
                    <Pencil size={14} />
                    수정
                  </button>
                  <button type="button" onClick={deleteSelected} className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600">
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
