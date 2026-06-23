import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { linkify } from '../utils/linkify'
import { ArrowLeft, BriefcaseBusiness, Megaphone, Pencil, Search, Sparkles, ThumbsUp, Trash2, UsersRound } from 'lucide-react'
import { getNotice, createNotice, updateNotice, deleteNotice, voteNotice } from '../services/noticeApi'
import { searchYoutubeVideos } from '../services/communityApi'
import { useAuth } from '../contexts/useAuth'
import { NoticeCategory } from '../contract/enums'
import { enumLabels } from '../contract/labels'
import { useNotices } from './useNotices'
import RichBodyEditor from '../components/richEditor/RichBodyEditor'
import { URL_ONLY_RICH_FEATURES } from '../components/richEditor/richBodyFeatures'
import { renderRichBody, richBodyToPlainText as noticeContentSearchText } from '../components/richEditor/renderRichBody'
import { serializeRichBody, richBodyPlainText } from '../components/richEditor/serializeRichBody'
import { parsePostBlocks } from './community/postEditorUtils'

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

// Keys bound to the canonical Notice.Category enum (drift-guarded).
const NOTICE_CATEGORY_META = enumLabels(NoticeCategory, {
  [NoticeCategory.GENERAL]: {
    label: '공지',
    shortLabel: '공지',
    featuredLabel: '최신 공지',
    icon: Megaphone,
    badgeClass: 'bg-[#e8f8ff] text-[var(--app-accent-text)]',
  },
  [NoticeCategory.PROMOTION]: {
    label: '홍보',
    shortLabel: '홍보',
    featuredLabel: '최신 홍보',
    icon: Sparkles,
    badgeClass: 'bg-[#eafaf2] text-[#248a3d]',
  },
  [NoticeCategory.SMALL_GROUP]: {
    label: '소모임',
    shortLabel: '소모임',
    featuredLabel: '최신 소모임',
    icon: UsersRound,
    badgeClass: 'bg-[#f2efff] text-[#6e56cf]',
  },
  [NoticeCategory.JOB]: {
    label: '취업공고',
    shortLabel: '취업',
    featuredLabel: '최신 취업공고',
    icon: BriefcaseBusiness,
    badgeClass: 'bg-amber-100 text-amber-700',
  },
})

const NOTICE_CATEGORY_OPTIONS = [
  NoticeCategory.GENERAL,
  NoticeCategory.PROMOTION,
  NoticeCategory.SMALL_GROUP,
  NoticeCategory.JOB,
]

const NOTICE_FILTERS = [
  { value: 'ALL', label: '전체', icon: Megaphone },
  ...NOTICE_CATEGORY_OPTIONS.map((value) => ({
    value,
    label: NOTICE_CATEGORY_META[value].label,
    icon: NOTICE_CATEGORY_META[value].icon,
  })),
]

function noticeCategoryMeta(value) {
  return NOTICE_CATEGORY_META[value] || NOTICE_CATEGORY_META.GENERAL
}

function NoticeForm({ initialNotice, defaultCategory, onCancel, onSave }: any) {
  const [formData, setFormData] = useState({
    title: initialNotice?.title || '',
    category: initialNotice?.category || defaultCategory || 'GENERAL',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editorApiRef = useRef(null)
  // Convert existing plain or rich content into editor blocks once at mount.
  // Intentionally runs once: re-deriving blocks on every initialNotice change
  // would clobber in-progress edits, so the dependency array is empty by design.
  const initialBlocks = useMemo(
    () => (initialNotice ? parsePostBlocks({ content: initialNotice.content }) : []),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const save = async () => {
    if (!formData.title.trim()) { setError('제목을 입력해주세요.'); return }
    const blocks = editorApiRef.current?.getBlocks() || []
    const content = serializeRichBody(blocks)
    if (!content || !richBodyPlainText(blocks)) { setError('내용을 입력해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const body = { ...formData, content, pinned: false }
      const saved = initialNotice
        ? await updateNotice(initialNotice.id, body)
        : await createNotice(body)
      onSave(saved)
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
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
        className="w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm"
      />
      <RichBodyEditor
        initialBlocks={initialBlocks}
        apiRef={editorApiRef}
        features={URL_ONLY_RICH_FEATURES}
        error={error}
        onError={setError}
        searchYoutube={searchYoutubeVideos}
      />
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={formData.category}
          onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
          className="flex-1 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-3 text-sm font-semibold sm:flex-none sm:py-2"
        >
          {NOTICE_CATEGORY_OPTIONS.map((value) => (
            <option key={value} value={value}>{noticeCategoryMeta(value).label}</option>
          ))}
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
  const { notices, setNotices, refreshNotices, loading, error } = useNotices()
  const [mode, setMode] = useState('list')
  const [selectedNotice, setSelectedNotice] = useState(null)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const isAdmin = user?.role === 'ADMIN'

  const filteredNotices = useMemo(() => {
    const byCategory = activeCategory === 'ALL'
      ? notices
      : notices.filter((notice) => (notice.category || 'GENERAL') === activeCategory)
    if (!searchQuery.trim()) return byCategory
    const q = searchQuery.toLowerCase()
    return byCategory.filter((notice) =>
      (notice.title || '').toLowerCase().includes(q) ||
      noticeContentSearchText(notice.content).toLowerCase().includes(q) ||
      (notice.author || '').toLowerCase().includes(q) ||
      noticeCategoryMeta(notice.category || 'GENERAL').label.toLowerCase().includes(q)
    )
  }, [activeCategory, notices, searchQuery])
  const featuredNotices = useMemo(
    () => NOTICE_CATEGORY_OPTIONS
      .map((category) => ({
        category,
        notice: notices.find((notice) => (notice.category || 'GENERAL') === category),
      }))
      .filter((item) => item.notice),
    [notices],
  )

  useEffect(() => {
    if (!urlId) return
    const numId = Number(urlId)
    if (isNaN(numId)) { navigate('/notices', { replace: true }); return }
    if (loading) return
    let mounted = true
    // Fetch the full notice so the view count is registered and engagement (조회/개추) is current.
    getNotice(numId)
      .then((detail) => {
        if (!mounted) return
        setSelectedNotice(detail)
        setNotices((prev) => prev.map((item) => (item.id === detail.id ? { ...item, ...detail } : item)))
      })
      .catch(() => { if (mounted) navigate('/notices', { replace: true }) })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, loading])

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
      refreshNotices()
      backToList()
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const [voting, setVoting] = useState(false)
  const handleNoticeVote = async () => {
    if (!selectedNotice || voting) return
    setVoting(true)
    try {
      const updated = await voteNotice(selectedNotice.id, selectedNotice.myVote === 1 ? 0 : 1)
      setSelectedNotice(updated)
      setNotices((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    } catch (err) {
      alert(err.message || '추천 중 오류가 발생했습니다.')
    } finally {
      setVoting(false)
    }
  }

  const visibleMode = !urlId && mode === 'edit' ? 'list' : mode
  const isDetail = !!urlId && !!selectedNotice && visibleMode === 'list'
  const headerTitle = visibleMode === 'write' ? '공지 작성' : visibleMode === 'edit' ? '공지 수정' : '공지사항'

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      {!urlId && visibleMode === 'list' && (
        <div className="flex justify-center sm:justify-start">
          <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-6 sm:px-7 sm:py-7">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">
              <p className="apple-eyebrow">Notices</p>
              <h1 className="apple-display mt-2 text-4xl sm:text-5xl">{headerTitle}</h1>
              <p className="apple-copy mt-3 max-w-xl text-base sm:text-lg">공지, 홍보, 소모임, 취업공고를 한 화면에서 빠르게 확인하고 검색합니다.</p>
            </div>
            {(!urlId && visibleMode === 'list') ? (
              isAdmin && <button type="button" onClick={() => setMode('write')} className="apple-action-primary justify-self-start px-5 py-2.5 text-sm md:justify-self-end">공지 작성</button>
            ) : (
              <button type="button" onClick={backToList} className="apple-action-secondary inline-flex items-center gap-1 justify-self-start px-4 py-2 text-sm md:justify-self-end">
                <ArrowLeft size={14} />
                목록
              </button>
            )}
          </div>
        </div>

        {!urlId && visibleMode === 'list' && (
          <>
            {featuredNotices.length > 0 && (
              <div className="apple-control-strip grid gap-3 px-4 py-4 sm:px-6 md:grid-cols-2 xl:grid-cols-4">
                {featuredNotices.map(({ category, notice }) => {
                  const meta = noticeCategoryMeta(category)
                  const Icon = meta.icon
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => openNotice(notice)}
                      className="apple-soft-panel group grid min-h-[5.75rem] grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 px-3.5 py-3 text-left transition hover:-translate-y-0.5 sm:min-h-24 sm:grid-cols-[3rem_minmax(0,1fr)] sm:px-4"
                    >
                      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full sm:size-12 ${meta.badgeClass}`}>
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-[var(--app-accent-text)]">{meta.featuredLabel}</span>
                        <span className="mt-1 block line-clamp-2 text-sm font-black leading-5 text-[var(--app-text)] sm:text-[15px]">{notice.title}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-[var(--app-subtle)]">{formatDate(notice.createdAt)} · {notice.author}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="apple-control-strip flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
              <div className="grid grid-cols-2 gap-2 text-sm font-bold sm:flex sm:flex-wrap">
                {NOTICE_FILTERS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveCategory(value)}
                    className={`apple-chip inline-flex min-w-0 items-center justify-center gap-2 px-3 py-2 sm:px-4 ${
                      activeCategory === value
                        ? 'apple-chip-active'
                        : ''
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex min-w-0 flex-1 items-center sm:flex-none">
                  <Search size={14} className="pointer-events-none absolute left-3 text-[var(--app-subtle)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="제목, 작성자 검색"
                    className="w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 pl-8 pr-3 text-sm text-[var(--app-text)] placeholder:text-[var(--app-subtle)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:w-64"
                  />
                </div>
                <span className="shrink-0 text-xs font-semibold text-[var(--app-subtle)]">{filteredNotices.length}개</span>
              </div>
            </div>
            {loading && <p className="px-4 py-16 text-center text-sm text-[var(--app-muted)]">불러오는 중...</p>}
            {error && <p className="mx-5 mt-5 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</p>}
            {!loading && !error && filteredNotices.length === 0 && (
              <p className="px-4 py-16 text-center text-sm text-[var(--app-muted)]">등록된 글이 없습니다.</p>
            )}
            {!loading && !error && filteredNotices.length > 0 && (
              <>
                {/* 모바일 카드 목록 */}
                <div className="mx-4 mb-4 hidden grid-cols-1 gap-2.5 max-md:grid sm:mx-6">
                  {filteredNotices.map((notice) => {
                    const open = () => openNotice(notice)
                    const meta = noticeCategoryMeta(notice.category || 'GENERAL')
                    return (
                      <button
                        key={notice.id}
                        type="button"
                        onClick={open}
                        className="notice-mobile-card apple-soft-panel text-left transition hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)] focus:outline-none"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${meta.badgeClass}`}>
                            {meta.label}
                          </span>
                          <span className="ml-auto text-[11px] text-[var(--app-subtle)]">{formatDate(notice.createdAt)}</span>
                        </div>
                        <span className="notice-mobile-title-frame">
                          <span className="line-clamp-2 text-[15px] font-bold leading-6 text-[var(--app-text)]">{notice.title}</span>
                        </span>
                        <span className="mt-auto truncate text-xs font-semibold text-[var(--app-subtle)]">{notice.author}</span>
                      </button>
                    )
                  })}
                </div>

                {/* 데스크탑 테이블 */}
                <div className="m-4 hidden overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] sm:m-6 md:block">
                  <table className="apple-table w-full min-w-[760px] border-collapse text-sm">
                    <thead className="border-b border-[var(--app-hairline)]">
                      <tr>
                        <th className="w-16 px-4 py-3">번호</th>
                        <th className="w-28 px-4 py-3">분류</th>
                        <th className="px-4 py-3 text-left">제목</th>
                        <th className="w-28 px-4 py-3">작성자</th>
                        <th className="w-28 px-4 py-3">작성일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {filteredNotices.map((notice) => {
                        const open = () => openNotice(notice)
                        const meta = noticeCategoryMeta(notice.category || 'GENERAL')
                        return (
                          <tr
                            key={notice.id}
                            tabIndex={0}
                            role="button"
                            onClick={open}
                            onKeyDown={(event) => openRowWithKeyboard(event, open)}
                            className="cursor-pointer text-[var(--app-muted)] transition hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)] focus:outline-none"
                          >
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-3.5 text-center text-xs text-[var(--app-subtle)]">{notice.id}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-3.5 text-center text-xs font-bold">
                              <span className={`inline-flex rounded-full px-2.5 py-1 ${meta.badgeClass}`}>{meta.shortLabel}</span>
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-3.5">
                              <span className="block max-w-[440px] truncate text-left font-semibold text-[var(--app-text)]">
                                {notice.title}
                              </span>
                            </td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-3.5 text-center text-xs">{notice.author}</td>
                            <td {...clickableCell(open)} className="cursor-pointer px-4 py-3.5 text-center text-xs text-[var(--app-subtle)]">{formatDate(notice.createdAt)}</td>
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
          <div className="p-4 sm:p-6">
            <NoticeForm
              defaultCategory={activeCategory === 'ALL' ? 'GENERAL' : activeCategory}
              onCancel={backToList}
              onSave={(notice) => { mergeNotice(notice); refreshNotices() }}
            />
          </div>
        )}

        {visibleMode === 'edit' && selectedNotice && (
          <div className="p-4 sm:p-6">
            <NoticeForm
              initialNotice={selectedNotice}
              onCancel={() => {
                setMode('list')
                navigate('/notices/' + selectedNotice.id)
              }}
              onSave={(notice) => { mergeNotice(notice); refreshNotices() }}
            />
          </div>
        )}

        {isDetail && (
          <article className="m-3 overflow-hidden rounded-lg bg-[var(--app-surface)] shadow-[0_18px_50px_rgba(0,0,0,0.10)] sm:m-6">
            <div className="border-b border-[var(--app-hairline)] px-4 py-5 sm:px-5">
              <div className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${noticeCategoryMeta(selectedNotice.category || 'GENERAL').badgeClass}`}>
                {noticeCategoryMeta(selectedNotice.category || 'GENERAL').label}
              </div>
              <h2 className="break-words text-xl font-black leading-tight sm:text-3xl md:text-4xl">
                {selectedNotice.title}
              </h2>
              <p className="mt-3 text-xs text-[var(--app-subtle)]">
                작성자 {selectedNotice.author} · {new Date(selectedNotice.createdAt).toLocaleString('ko-KR')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-subtle)]">
                <span>조회 {selectedNotice.viewCount ?? 0}</span>
                <span>개추 {selectedNotice.upvotes ?? 0}</span>
              </div>
            </div>
            <div className="text-size-container min-h-[200px] break-words auto-text-notice sm:min-h-[360px]">
              {renderRichBody(
                selectedNotice.content,
                (plain) => <div className="whitespace-pre-wrap px-4 py-5 sm:px-5 sm:py-7">{linkify(plain)}</div>,
              )}
            </div>
            <div className="flex items-center justify-center border-t border-[var(--app-hairline)] bg-[#fafafa] px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={handleNoticeVote}
                disabled={voting}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-black disabled:opacity-50 ${selectedNotice.myVote === 1 ? 'border-[#0071e3] bg-[var(--app-accent)] text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'}`}
              >
                <ThumbsUp size={16} />
                개추 {selectedNotice.upvotes ?? 0}
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-[var(--app-hairline)] px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-between sm:px-5">
              <button type="button" onClick={backToList} className="apple-action-secondary min-h-11 px-4 py-2 text-sm sm:min-h-0">
                목록
              </button>
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={() => setMode('edit')} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
                    <Pencil size={14} />
                    수정
                  </button>
                  <button type="button" onClick={deleteSelected} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 sm:min-h-0">
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
