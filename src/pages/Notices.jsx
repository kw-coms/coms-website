import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { linkify } from '../utils/linkify.jsx'
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

function NoticeForm({ initialNotice, defaultCategory, onCancel, onSave }) {
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
      const body = { ...formData, pinned: false }
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
    <div className="apple-soft-panel space-y-3 p-4 sm:space-y-4 sm:p-5">
      <input
        value={formData.title}
        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
        placeholder="제목"
        className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 text-base text-[#1d1d1f] outline-none focus:ring-2 focus:ring-[#0071e3]/24 sm:text-sm"
      />
      <textarea
        value={formData.content}
        onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
        placeholder="내용"
        rows={10}
        className="w-full resize-y rounded-lg border border-black/10 bg-white px-4 py-3 text-base leading-7 text-[#1d1d1f] outline-none focus:ring-2 focus:ring-[#0071e3]/24 sm:rows-14 sm:text-sm"
      />
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={formData.category}
          onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
          className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-3 text-sm font-semibold sm:flex-none sm:py-2"
        >
          <option value="GENERAL">공지</option>
          <option value="JOB">취업공고</option>
        </select>
        <button type="button" onClick={save} disabled={saving} className="apple-action-primary min-h-12 flex-1 px-5 text-sm disabled:opacity-50 sm:min-h-0 sm:flex-none sm:py-2.5">
          {saving ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="apple-action-secondary min-h-12 flex-1 px-4 text-sm sm:min-h-0 sm:flex-none sm:py-2.5">
          취소
        </button>
      </div>
    </div>
  )
}

export default function Notices() {
  const { id: urlId } = useParams()
  const navigate = useNavigate()
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
      (notice.title || '').toLowerCase().includes(q) ||
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

  useEffect(() => {
    if (!urlId) return
    const numId = Number(urlId)
    if (isNaN(numId)) { navigate('/notices', { replace: true }); return }
    if (loading) return
    const found = notices.find((n) => n.id === numId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (found) setSelectedNotice(found)
    else navigate('/notices', { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, loading, notices.length])

  const openNotice = (notice) => {
    setMode('list')
    setSelectedNotice(notice)
    navigate('/notices/' + notice.id)
  }

  const backToList = () => {
    setMode('list')
    setSelectedNotice(null)
    navigate('/notices')
  }

  const mergeNotice = (notice) => {
    setNotices((prev) => {
      const exists = prev.some((item) => item.id === notice.id)
      if (!exists) return [notice, ...prev]
      return prev.map((item) => (item.id === notice.id ? notice : item))
    })
    setSelectedNotice(notice)
    setMode('list')
    navigate('/notices/' + notice.id, { replace: true })
  }

  const deleteSelected = async () => {
    if (!selectedNotice || !window.confirm('공지사항을 삭제하시겠습니까?')) return
    try {
      await deleteNotice(selectedNotice.id)
      setNotices((prev) => prev.filter((notice) => notice.id !== selectedNotice.id))
      backToList()
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const visibleMode = !urlId && mode === 'edit' ? 'list' : mode
  const isDetail = !!urlId && !!selectedNotice && visibleMode === 'list'
  const headerTitle = visibleMode === 'write' ? '공지 작성' : visibleMode === 'edit' ? '공지 수정' : '공지사항'

  return (
    <div className="min-w-0 space-y-4">
      {!urlId && visibleMode === 'list' && (
        <div className="flex justify-center sm:justify-start">
          <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-7 sm:px-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="apple-eyebrow">Notices</p>
              <h1 className="apple-display mt-3 text-4xl sm:text-6xl">{headerTitle}</h1>
              <p className="apple-copy mt-4 max-w-2xl text-base sm:text-lg">공지와 취업공고를 한 화면에서 빠르게 확인하고 검색합니다.</p>
            </div>
            {(!urlId && visibleMode === 'list') ? (
              isAdmin && <button type="button" onClick={() => setMode('write')} className="apple-action-primary px-5 py-2.5 text-sm">공지 작성</button>
            ) : (
              <button type="button" onClick={backToList} className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm">
                <ArrowLeft size={14} />
                목록
              </button>
            )}
          </div>
        </div>

        {!urlId && visibleMode === 'list' && (
          <>
            {(featuredNotice || featuredJob) && (
              <div className="apple-control-strip grid gap-3 px-5 py-4 sm:px-8 lg:grid-cols-2">
                {[
                  ['최신 공지', featuredNotice, Megaphone],
                  ['최신 취업공고', featuredJob, BriefcaseBusiness],
                ].map(([label, notice, Icon]) => (
                  notice && (
                    <button
                      key={label}
                      type="button"
                      onClick={() => openNotice(notice)}
                      className="apple-soft-panel group flex min-h-24 items-center gap-4 px-4 py-3 text-left transition hover:-translate-y-0.5"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#e8f8ff] text-[#0066cc]">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-[#0066cc]">{label}</span>
                        <span className="mt-2 block truncate text-base font-black text-[#1d1d1f]">{notice.title}</span>
                        <span className="mt-1 block text-xs font-semibold text-[#86868b]">{formatDate(notice.createdAt)} · {notice.author}</span>
                      </span>
                    </button>
                  )
                ))}
              </div>
            )}
            <div className="apple-control-strip flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8">
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
                    className={`apple-chip inline-flex items-center gap-2 px-4 py-2 ${
                      activeCategory === value
                        ? 'apple-chip-active'
                        : ''
                    }`}
                  >
                    {value === 'JOB' ? <BriefcaseBusiness size={14} /> : <Megaphone size={14} />}
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex flex-1 items-center sm:flex-none">
                  <Search size={14} className="pointer-events-none absolute left-3 text-[#86868b]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="제목, 작성자 검색"
                    className="w-full rounded-full border border-black/10 bg-white py-2 pl-8 pr-3 text-sm text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:ring-2 focus:ring-[#0071e3]/24 sm:w-56"
                  />
                </div>
                <span className="shrink-0 text-xs font-semibold text-[#86868b]">{filteredNotices.length}개</span>
              </div>
            </div>
            {loading && <p className="px-4 py-16 text-center text-sm text-[#6e6e73]">불러오는 중...</p>}
            {error && <p className="mx-5 mt-5 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</p>}
            {!loading && !error && filteredNotices.length === 0 && (
              <p className="px-4 py-16 text-center text-sm text-[#6e6e73]">등록된 글이 없습니다.</p>
            )}
            {!loading && !error && filteredNotices.length > 0 && (
              <>
                {/* 모바일 카드 목록 */}
                <div className="mx-5 mb-5 hidden flex-col divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white max-md:flex sm:mx-7">
                  {filteredNotices.map((notice) => {
                    const open = () => openNotice(notice)
                    const isJob = (notice.category || 'GENERAL') === 'JOB'
                    return (
                      <button
                        key={notice.id}
                        type="button"
                        onClick={open}
                        className="flex flex-col gap-1.5 px-4 py-4 text-left transition hover:bg-[#f5f5f7] focus:bg-[#f5f5f7] focus:outline-none"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${isJob ? 'bg-amber-100 text-amber-700' : 'bg-[#e8f8ff] text-[#0066cc]'}`}>
                            {isJob ? '취업공고' : '공지'}
                          </span>
                          <span className="ml-auto text-[11px] text-[#86868b]">{formatDate(notice.createdAt)}</span>
                        </div>
                        <span className="line-clamp-2 text-sm font-semibold leading-6 text-[#1d1d1f]">{notice.title}</span>
                        <span className="text-xs text-[#86868b]">{notice.author}</span>
                      </button>
                    )
                  })}
                </div>

                {/* 데스크탑 테이블 */}
                <div className="m-5 hidden overflow-hidden rounded-lg border border-black/10 bg-white sm:m-8 md:block">
                  <table className="apple-table w-full min-w-[760px] border-collapse text-sm">
                    <thead className="border-b border-black/10">
                      <tr>
                        <th className="w-20 px-4 py-3">번호</th>
                        <th className="w-28 px-4 py-3">분류</th>
                        <th className="px-4 py-3 text-left">제목</th>
                        <th className="w-32 px-4 py-3">작성자</th>
                        <th className="w-28 px-4 py-3">작성일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredNotices.map((notice) => {
                        const open = () => openNotice(notice)
                        return (
                          <tr
                            key={notice.id}
                            tabIndex={0}
                            role="button"
                            onClick={open}
                            onKeyDown={(event) => openRowWithKeyboard(event, open)}
                            className="cursor-pointer text-[#6e6e73] transition hover:bg-[#f5f5f7] focus:bg-[#f5f5f7] focus:outline-none"
                          >
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-[#86868b]">{notice.id}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-bold text-[#0066cc]">{(notice.category || 'GENERAL') === 'JOB' ? '취업' : '공지'}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                              <span className="block max-w-[520px] truncate text-left font-semibold text-[#1d1d1f]">
                                {notice.title}
                              </span>
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{notice.author}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-[#86868b]">{formatDate(notice.createdAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {visibleMode === 'write' && (
          <div className="p-5 sm:p-7">
            <NoticeForm
              defaultCategory={activeCategory === 'JOB' ? 'JOB' : 'GENERAL'}
              onCancel={backToList}
              onSave={(notice) => { mergeNotice(notice); load({ showLoading: false }) }}
            />
          </div>
        )}

        {visibleMode === 'edit' && selectedNotice && (
          <div className="p-5 sm:p-7">
            <NoticeForm
              initialNotice={selectedNotice}
              onCancel={() => {
                setMode('list')
                navigate('/notices/' + selectedNotice.id)
              }}
              onSave={(notice) => { mergeNotice(notice); load({ showLoading: false }) }}
            />
          </div>
        )}

        {isDetail && (
          <article className="m-3 overflow-hidden rounded-lg bg-white shadow-[0_18px_50px_rgba(0,0,0,0.10)] sm:m-8">
            <div className="border-b border-black/10 px-4 py-5 sm:px-5">
              <div className="mb-2 text-xs font-bold text-[#0066cc]">{(selectedNotice.category || 'GENERAL') === 'JOB' ? '취업공고' : '공지'}</div>
              <h2 className="break-words text-xl font-black leading-tight sm:text-3xl md:text-4xl">
                {selectedNotice.title}
              </h2>
              <p className="mt-3 text-xs text-[#86868b]">
                작성자 {selectedNotice.author} · {new Date(selectedNotice.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>
            <div className="text-size-container min-h-[200px] whitespace-pre-wrap break-words px-4 py-5 auto-text-notice sm:min-h-[360px] sm:px-5 sm:py-7">{linkify(selectedNotice.content)}</div>
            <div className="flex flex-col gap-2 border-t border-black/10 px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-between sm:px-5">
              <button type="button" onClick={backToList} className="apple-action-secondary min-h-11 px-4 py-2 text-sm sm:min-h-0">
                목록
              </button>
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={() => setMode('edit')} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold sm:min-h-0">
                    <Pencil size={14} />
                    수정
                  </button>
                  <button type="button" onClick={deleteSelected} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 sm:min-h-0">
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
