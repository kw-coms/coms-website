import PageHeading from '../components/PageHeading'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { linkify } from '../utils/linkify'
import { ArrowLeft, BriefcaseBusiness, Megaphone, Pencil, Pin, PinOff, Search, Sparkles, ThumbsUp, Trash2, UsersRound } from 'lucide-react'
import { getNotice, createNotice, updateNotice, deleteNotice, voteNotice, pinNotice, updateNoticeAuthor } from '../services/noticeApi'
import { showToast } from '../components/common/Toast'
import { confirmDialog } from '../components/common/ConfirmDialog'
import AuthorChangeDialog from '../components/common/AuthorChangeDialog'
import { Skeleton, SkeletonLine, SkeletonGroup } from '../components/common/Skeleton'
import ErrorState from '../components/common/ErrorState'
import { fetchLinkPreview, searchYoutubeVideos } from '../services/communityApi'
import { useAuth } from '../contexts/useAuth'
import { NoticeCategory } from '../contract/enums'
import { enumLabels } from '../contract/labels'
import { useNotices } from './useNotices'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { ListSelect } from '../components/common/ListTools'
import { compareDate, compareNumber, sortedBy } from '../utils/listTools'

// "기본 순서" is the order the server sends (pinned notices first).
const NOTICE_SORT_OPTIONS = [
  { value: 'default', label: '기본 순서' },
  { value: 'newest', label: '최신순' },
  { value: 'oldest', label: '오래된순' },
  { value: 'views', label: '조회순' },
  { value: 'upvotes', label: '추천순' },
]
import { useVisibleCount } from '../hooks/useVisibleCount'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import RichBodyEditor from '../components/richEditor/RichBodyEditor'
import { UPLOAD_RICH_FEATURES } from '../components/richEditor/richBodyFeatures'
import { resetRejectedRichBlocks, uploadPendingRichBlocks } from '../components/richEditor/uploadPendingRichBlocks'
import { renderRichBody, richBodyToPlainText as noticeContentSearchText } from '../components/richEditor/renderRichBody'
import { serializeRichBody, richBodyPlainText } from '../components/richEditor/serializeRichBody'
import { parseRichBodyBlocks } from '../components/richEditor/parseRichBodyBlocks'
import { parsePostBlocks } from './community/postEditorUtils'
import { canDeleteNotice, canEditNotice, canManageSensitiveAdmin, canWriteNotice } from '../utils/roleAccess'
import { usePermissions } from '../contexts/usePermissions'
import Chip from '../components/common/Chip'
import DraftNotice, { DraftConflictNotice } from '../components/common/DraftNotice'
import { confirmEditorLeave, useEditorDraft } from '../hooks/useEditorDraft'
import { draftIsStale, draftStorageKey, readDraft } from '../utils/editorDraft'
import { isNoticeUnread, loadNoticeReadState, markAllNoticesRead, markNoticeRead, saveNoticeReadState, visitList } from '../utils/noticeReads'
import { memberSessionEpoch } from '../utils/memberSession'

function NewDot() {
  return <span data-notice-new className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-[var(--app-accent-text)]"><span className="size-1.5 rounded-full bg-[var(--app-accent)]" aria-hidden="true" />새 글</span>
}

function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ko-KR')
}

function openRowWithKeyboard(event, open) {
  // Keys bubble up from anything focusable inside the row. Only a key pressed on the row
  // itself opens it, so Enter/Space on a nested button or link keeps its own meaning.
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
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

type NoticeFormProps = {
  initialNotice?: { id?: number; title?: string; category?: string; content?: string; [key: string]: unknown } | null
  defaultCategory?: string
  onCancel: () => void
  onSave: (saved: unknown) => void
}

function NoticeForm(props: NoticeFormProps) {
  const { user } = useAuth()
  if (!user?.studentId) return null
  return <NoticeEditor key={`${user.studentId}:${props.initialNotice?.id ?? 'new'}`} {...props} />
}

function NoticeEditor({ initialNotice, defaultCategory, onCancel, onSave }: NoticeFormProps) {
  const { user } = useAuth()
  const storageKey = draftStorageKey(user?.studentId, 'notice', initialNotice?.id)
  const [stored] = useState(() => readDraft(storageKey))
  // A draft older than the notice's last server change is offered, never applied on its own.
  const conflict = Boolean(stored) && Boolean(initialNotice) && draftIsStale(stored, typeof initialNotice?.updatedAt === 'string' ? initialNotice.updatedAt : null)
  const [restored, setRestored] = useState(conflict ? null : stored)
  const [pendingDraft, setPendingDraft] = useState(conflict ? stored : null)
  const savedCategory = initialNotice?.category || defaultCategory || 'GENERAL'
  const [formData, setFormData] = useState({
    title: restored?.title ?? (initialNotice?.title || ''),
    category: restored?.category || savedCategory,
  })
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editorApiRef = useRef(null)
  // Convert existing plain or rich content into editor blocks once at mount.
  // Intentionally runs once: re-deriving blocks on every initialNotice change
  // would clobber in-progress edits, so the dependency array is empty by design.
  const savedBlocks = () => (initialNotice ? parseRichBodyBlocks(initialNotice.content || '') : [])
  const [initialBlocks, setInitialBlocks] = useState(() => (restored ? parseRichBodyBlocks(restored.content) : savedBlocks()))
  const [originalBlocks] = useState(savedBlocks)
  const draft = useEditorDraft({
    storageKey,
    baseline: () => ({ title: initialNotice?.title || '', category: savedCategory, anonymousName: '', content: serializeRichBody(originalBlocks) }),
    current: () => {
      const blocks = editorApiRef.current?.getBlocks()
      return { title: formData.title, category: formData.category, anonymousName: '', content: serializeRichBody(blocks ?? initialBlocks) }
    },
    hasPending: () => (editorApiRef.current?.getBlocks() || []).some((block) => block.type !== 'text' && block.status !== 'saved' && block.file),
    paused: Boolean(pendingDraft),
  })
  const applyDraft = (picked) => {
    setFormData({ title: picked.title, category: picked.category || savedCategory })
    setInitialBlocks(parseRichBodyBlocks(picked.content))
    setEditorKey((key) => key + 1)
    setRestored(picked)
    setPendingDraft(null)
  }
  const keepCurrent = () => {
    draft.reset()
    setPendingDraft(null)
  }
  const discardDraft = () => {
    draft.reset()
    setRestored(null)
    setFormData({ title: initialNotice?.title || '', category: savedCategory })
    setInitialBlocks(savedBlocks())
    setEditorKey((key) => key + 1)
  }

  const save = async () => {
    if (!formData.title.trim()) { setError('제목을 입력해주세요.'); return }
    const blocks = editorApiRef.current?.getBlocks() || []
    if (!richBodyPlainText(blocks) && !blocks.some((b) => ['image', 'video', 'file', 'externalEmbed'].includes(b.type))) { setError('내용을 입력해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const uploaded = await uploadPendingRichBlocks(blocks, 'notice', (id, patch) => editorApiRef.current?.updateFigureMeta(id, patch))
      const content = serializeRichBody(uploaded)
      const body = { ...formData, content, pinned: Boolean(initialNotice?.pinned) }
      const saved = initialNotice
        ? await updateNotice(initialNotice.id, body)
        : await createNotice(body)
      draft.clear()
      onSave(saved)
    } catch (err) {
      resetRejectedRichBlocks(blocks, err, (id, patch) => editorApiRef.current?.updateFigureMeta(id, patch))
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="apple-soft-panel space-y-3 p-4 sm:space-y-4 sm:p-5">
      {pendingDraft && <DraftConflictNotice savedAt={pendingDraft.savedAt} updatedAt={typeof initialNotice?.updatedAt === 'string' ? initialNotice.updatedAt : null} onApply={() => applyDraft(pendingDraft)} onKeep={keepCurrent} />}
      {draft.saveFailed && <p role="alert" className="text-xs font-semibold text-red-500">임시 저장하지 못했어요. 저장 공간이 부족하거나 막혀 있습니다. 이 페이지를 떠나면 작성한 내용이 사라질 수 있어요.</p>}
      {restored && <DraftNotice onDiscard={discardDraft} />}
      <fieldset disabled={Boolean(pendingDraft)} inert={Boolean(pendingDraft)} className="min-w-0 space-y-3 sm:space-y-4">
      <input
        value={formData.title}
        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
        placeholder="제목"
        className="w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm"
      />
      <RichBodyEditor
        key={editorKey}
        initialBlocks={initialBlocks}
        apiRef={editorApiRef}
        features={UPLOAD_RICH_FEATURES}
        allowArchiveFiles
        error={error}
        onError={setError}
        searchYoutube={searchYoutubeVideos}
        fetchLinkPreview={fetchLinkPreview}
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
      </fieldset>
    </div>
  )
}

export default function Notices() {
  const { id: urlId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { permissions } = usePermissions()
  const { notices, setNotices, refreshNotices, loading, error } = useNotices()
  const [mode, setMode] = useState('list')
  const [selectedNotice, setSelectedNotice] = useState(null)
  // The list filter is mirrored into the query string (replace, so no extra history entries).
  // App keys the routed page by pathname, which remounts this component between /notices and
  // /notices/:id; without the mirror, Back from a notice landed on an unfiltered list. State
  // stays the source of truth: router updates are transitions, too late for a controlled
  // input during Korean IME composition.
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [activeCategory, setActiveCategory] = useState(() => {
    const category = searchParams.get('category')
    return NOTICE_FILTERS.some((filter) => filter.value === category) ? category : 'ALL'
  })
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const updateListFilter = (category, query) => {
    setActiveCategory(category)
    setSearchQuery(query)
    const params = new URLSearchParams()
    if (category !== 'ALL') params.set('category', category)
    if (query) params.set('q', query)
    try {
      setSearchParams(params, { replace: true })
    } catch {
      // Safari throws once replaceState is called 100+ times in a few seconds (a held key).
      // The filter above is already applied; only the URL misses this keystroke.
    }
  }

  useScrollReveal([notices?.length, loading])

  const isAdmin = canWriteNotice(permissions)

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
  const [sortKey, setSortKey] = useState('default')
  const sortedNotices = useMemo(() => {
    if (sortKey === 'newest') return sortedBy(filteredNotices, (a, b) => compareDate(a.createdAt, b.createdAt, 'desc'))
    if (sortKey === 'oldest') return sortedBy(filteredNotices, (a, b) => compareDate(a.createdAt, b.createdAt, 'asc'))
    if (sortKey === 'views') return sortedBy(filteredNotices, (a, b) => compareNumber(a.viewCount, b.viewCount, 'desc'))
    if (sortKey === 'upvotes') return sortedBy(filteredNotices, (a, b) => compareNumber(a.upvotes, b.upvotes, 'desc'))
    return filteredNotices
  }, [filteredNotices, sortKey])
  const { visible, canLoadMore, loadMore, total } = useVisibleCount(
    filteredNotices.length,
    20,
    `${activeCategory}|${searchQuery}|${sortKey}`,
  )
  const visibleNotices = sortedNotices.slice(0, visible)
  // "최신" is the newest by date; the server order puts pinned notices first, so an old pinned
  // notice would otherwise be labelled newest.
  const featuredNotices = useMemo(
    () => NOTICE_CATEGORY_OPTIONS
      .map((category) => ({
        category,
        notice: notices
          .filter((notice) => (notice.category || 'GENERAL') === category)
          .reduce((latest, notice) => (!latest || compareDate(notice.createdAt, latest.createdAt, 'desc') < 0 ? notice : latest), null),
      }))
      .filter((item) => item.notice),
    [notices],
  )

  // Unread markers live in this browser only (see utils/noticeReads).
  const [readState, setReadState] = useState(() => visitList(loadNoticeReadState(user?.studentId), Date.now()))
  const [readEpoch] = useState(memberSessionEpoch)
  useEffect(() => { saveNoticeReadState(user?.studentId, readState, undefined, readEpoch) }, [readState, user?.studentId, readEpoch])
  const unreadCount = notices.filter((notice) => isNoticeUnread(readState, notice)).length
  const markRead = (id) => setReadState((prev) => markNoticeRead(prev, id))

  useEffect(() => {
    if (!urlId) return
    const numId = Number(urlId)
    if (isNaN(numId)) { navigate('/notices', { replace: true }); return }
    if (loading) return
    let mounted = true
    // Fetch the full notice so the view count is registered and engagement (조회/추천) is current.
    getNotice(numId)
      .then((detail) => {
        if (!mounted) return
        setSelectedNotice(detail)
        markRead(detail.id)
        setNotices((prev) => prev.map((item) => (item.id === detail.id ? { ...item, ...detail } : item)))
      })
      .catch(() => { if (mounted) navigate('/notices', { replace: true }) })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, loading])

  const openNotice = (notice) => {
    markRead(notice.id)
    setMode('list')
    setSelectedNotice(notice)
    // Remembered so "목록" on the notice returns to the filtered list it was opened from.
    navigate('/notices/' + notice.id, { state: { listSearch: location.search } })
  }

  const backToList = async () => {
    if (!(await confirmEditorLeave())) return
    setMode('list')
    setSelectedNotice(null)
    // Leaving write mode, the URL already is the list with its filter query; pushing a bare
    // /notices there dropped the query and left a duplicate history entry.
    if (urlId) navigate('/notices' + (typeof location.state?.listSearch === 'string' ? location.state.listSearch : ''))
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
    if (!selectedNotice || !(await confirmDialog({ message: '공지사항을 삭제하시겠습니까?', tone: 'danger' }))) return
    try {
      await deleteNotice(selectedNotice.id)
      setNotices((prev) => prev.filter((notice) => notice.id !== selectedNotice.id))
      refreshNotices()
      backToList()
    } catch (err) {
      showToast({ message: err.message || '삭제 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const [pinning, setPinning] = useState(false)
  const handlePinSelected = async () => {
    if (!selectedNotice || pinning) return
    setPinning(true)
    const nextPinned = !selectedNotice.pinned
    try {
      const updated = await pinNotice(selectedNotice.id, nextPinned)
      setSelectedNotice(updated)
      setNotices((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      refreshNotices()
      showToast({ message: nextPinned ? '공지를 고정했습니다.' : '고정을 해제했습니다.', tone: 'success' })
    } catch (err) {
      showToast({ message: err.message || '고정 처리 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setPinning(false)
    }
  }

  const [editingAuthor, setEditingAuthor] = useState(false)
  const handleAuthorEdit = async (payload) => {
    if (!selectedNotice) return
    const updated = await updateNoticeAuthor(selectedNotice.id, payload)
    setSelectedNotice(updated)
    setNotices((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    showToast({ message: '작성자가 변경되었습니다.', tone: 'success' })
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
      showToast({ message: err.message || '추천 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setVoting(false)
    }
  }

  const visibleMode = !urlId && mode === 'edit' ? 'list' : mode
  const isDetail = !!urlId && !!selectedNotice && visibleMode === 'list'
  useDocumentTitle(isDetail ? selectedNotice.title : null)
  const headerTitle = visibleMode === 'write' ? '공지 작성' : visibleMode === 'edit' ? '공지 수정' : '공지사항'
  // The list/table wants the full content width; the single-notice reading view
  // and the write/edit forms stay narrower for readability.
  const isListView = !urlId && visibleMode === 'list'

  return (
    <div className={`mx-auto w-full min-w-0 space-y-4 ${isListView ? 'max-w-7xl' : 'max-w-5xl'}`}>
      {!urlId && visibleMode === 'list' && (
        <div className="flex justify-center sm:justify-start">
          <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-6 sm:px-7 sm:py-7" data-reveal>
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">
              <span className="coms-icon coms-board-icon" aria-hidden="true"><Megaphone size={22} strokeWidth={2} /></span>
              <PageHeading className="apple-display mt-2 text-4xl sm:text-5xl">{headerTitle}</PageHeading>
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
              <>
              {/* Phones: one compact scrolling row instead of four stacked cards. */}
              <div data-notice-featured-compact className="apple-control-strip flex snap-x gap-2 overflow-x-auto px-4 py-3 sm:hidden" aria-label="최신 공지">
                {featuredNotices.map(({ category, notice }) => {
                  const meta = noticeCategoryMeta(category)
                  return (
                    <button key={category} type="button" onClick={() => openNotice(notice)} className="apple-soft-panel min-w-[62%] max-w-[62%] shrink-0 snap-start px-3 py-2 text-left">
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-[var(--app-accent-text)]">
                        {meta.featuredLabel}
                        {notice.pinned && <Chip variant="pinned">고정</Chip>}
                        {isNoticeUnread(readState, notice) && <NewDot />}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-bold text-[var(--app-text)]">{notice.title}</span>
                    </button>
                  )
                })}
              </div>
              <div className="apple-control-strip hidden gap-3 px-4 py-4 sm:grid sm:px-6 md:grid-cols-2 xl:grid-cols-4">
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
                        <span className="flex items-center gap-1.5 text-xs font-black text-[var(--app-accent-text)]">{meta.featuredLabel}{notice.pinned && <Chip variant="pinned">고정</Chip>}</span>
                        <span className="mt-1 block line-clamp-2 text-sm font-black leading-5 text-[var(--app-text)] sm:text-[15px]">{notice.title}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-[var(--app-subtle)]">{formatDate(notice.createdAt)} · {notice.author}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              </>
            )}
            <div className="apple-control-strip flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 sm:py-3">
              <div className="grid grid-cols-2 gap-2 text-sm font-bold sm:flex sm:flex-wrap">
                {NOTICE_FILTERS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateListFilter(value, searchQuery)}
                    className={`apple-chip inline-flex min-h-11 min-w-0 items-center justify-center gap-2 px-3 py-2 sm:min-h-0 sm:px-4 ${
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
                    onChange={(e) => updateListFilter(activeCategory, e.target.value)}
                    placeholder="제목, 내용, 작성자 검색"
                    className="h-11 w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 pl-8 pr-3 text-sm text-[var(--app-text)] placeholder:text-[var(--app-subtle)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:h-auto sm:w-64"
                  />
                </div>
                <ListSelect value={sortKey} onChange={setSortKey} options={NOTICE_SORT_OPTIONS} label="공지 정렬" />
                <span className="shrink-0 text-xs font-semibold text-[var(--app-subtle)]">{filteredNotices.length}개</span>
                {unreadCount > 0 && (
                  <button type="button" onClick={() => { setReadState((prev) => markAllNoticesRead(prev, Date.now())); showToast({ message: '모든 공지를 읽음으로 표시했습니다.', duration: 2500 }) }} className="apple-action-secondary shrink-0 px-3 py-1.5 text-xs">
                    모두 읽음
                  </button>
                )}
              </div>
            </div>
            {loading && (
              <SkeletonGroup>
                {/* 모바일 스켈레톤 카드 목록 */}
                <div className="mx-4 mb-4 grid grid-cols-1 gap-2.5 max-md:grid sm:mx-6 md:hidden">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="apple-soft-panel flex flex-col gap-2 px-3.5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-10 rounded-full" />
                        <Skeleton className="h-3 w-14 rounded-full ml-auto" />
                      </div>
                      <SkeletonLine className="w-4/5 rounded" />
                      <SkeletonLine className="w-1/2 rounded" />
                      <Skeleton className="h-3 w-16 rounded-full mt-1" />
                    </div>
                  ))}
                </div>

                {/* 데스크탑 스켈레톤 테이블 */}
                <div className="m-4 hidden overflow-x-auto rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] sm:m-6 md:block">
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
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3.5 text-center">
                            <Skeleton className="h-3 w-6 rounded mx-auto" />
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Skeleton className="h-5 w-14 rounded-full mx-auto" />
                          </td>
                          <td className="px-4 py-3.5">
                            <SkeletonLine className="w-3/4 rounded" />
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Skeleton className="h-3 w-16 rounded mx-auto" />
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Skeleton className="h-3 w-16 rounded mx-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SkeletonGroup>
            )}
            {!loading && error && (
              <ErrorState className="mx-5 mt-5 sm:mx-7" message={error} onRetry={refreshNotices} />
            )}
            {!loading && !error && filteredNotices.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-[var(--app-muted)] sm:py-16">등록된 글이 없습니다.</p>
            )}
            {!loading && !error && filteredNotices.length > 0 && (
              <>
                {/* 모바일 카드 목록 */}
                <div className="mx-4 mb-4 hidden grid-cols-1 gap-2.5 max-md:grid sm:mx-6">
                  {visibleNotices.map((notice, index) => {
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
                          {notice.pinned && (
                            <Chip variant="pinned">고정</Chip>
                          )}
                          {isNoticeUnread(readState, notice) && <NewDot />}
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
                {/* overflow-x-auto, not hidden: the table keeps a 760px minimum, which is wider
                    than this box on portrait tablets (768–859px) and cut off the date column. */}
                <div className="m-4 hidden overflow-x-auto rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] sm:m-6 md:block">
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
                      {visibleNotices.map((notice, index) => {
                        const open = () => openNotice(notice)
                        const meta = noticeCategoryMeta(notice.category || 'GENERAL')
                        // The row's onClick covers every cell. Each <td> used to carry the same
                        // handler, so one click navigated twice and Back needed two presses.
                        return (
                          <tr
                            key={notice.id}
                            tabIndex={0}
                            role="button"
                            onClick={open}
                            onKeyDown={(event) => openRowWithKeyboard(event, open)}
                            className="cursor-pointer text-[var(--app-muted)] transition hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)] focus:outline-none"
                          >
                            <td className="cursor-pointer px-4 py-3.5 text-center text-xs text-[var(--app-subtle)]">{notice.id}</td>
                            <td className="cursor-pointer px-4 py-3.5 text-center text-xs font-bold">
                              <span className={`inline-flex rounded-full px-2.5 py-1 ${meta.badgeClass}`}>{meta.shortLabel}</span>
                            </td>
                            <td className="cursor-pointer px-4 py-3.5">
                              <span className="flex max-w-[440px] items-center gap-1.5 text-left font-semibold text-[var(--app-text)]">
                                {notice.pinned && <Chip variant="pinned">고정</Chip>}
                                {isNoticeUnread(readState, notice) && <NewDot />}
                                <span className="min-w-0 truncate">{notice.title}</span>
                              </span>
                            </td>
                            <td className="cursor-pointer px-4 py-3.5 text-center text-xs">{notice.author}</td>
                            <td className="cursor-pointer px-4 py-3.5 text-center text-xs text-[var(--app-subtle)]">{formatDate(notice.createdAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col items-center gap-2 px-4 pb-5 sm:px-6">
                  <span className="text-xs font-semibold text-[var(--app-subtle)]">
                    전체 {total}개 중 {visibleNotices.length}개 표시
                  </span>
                  {canLoadMore && (
                    <button
                      type="button"
                      onClick={loadMore}
                      className="apple-action-secondary inline-flex min-h-11 items-center justify-center px-6 text-sm sm:min-h-10"
                    >
                      더 보기
                    </button>
                  )}
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
              onCancel={async () => {
                if (!(await confirmEditorLeave())) return
                setMode('list')
                navigate('/notices/' + selectedNotice.id)
              }}
              onSave={(notice) => { mergeNotice(notice); refreshNotices() }}
            />
          </div>
        )}

        {!!urlId && !selectedNotice && visibleMode === 'list' && (
          <SkeletonGroup label="공지를 여는 중">
            <div className="m-3 space-y-4 rounded-lg bg-[var(--app-surface)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.10)] sm:m-6 sm:p-6">
              <Skeleton className="h-5 w-20 rounded-full" />
              <SkeletonLine className="h-7 w-3/4" />
              <SkeletonLine className="w-1/3" />
              <div className="space-y-2 pt-2">
                <SkeletonLine className="w-full" />
                <SkeletonLine className="w-full" />
                <SkeletonLine className="w-5/6" />
              </div>
            </div>
          </SkeletonGroup>
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
                <span>추천 {selectedNotice.upvotes ?? 0}</span>
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
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-black disabled:opacity-50 ${selectedNotice.myVote === 1 ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'}`}
              >
                <ThumbsUp size={16} />
                추천 {selectedNotice.upvotes ?? 0}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--app-hairline)] px-4 py-4 sm:flex sm:flex-row sm:flex-wrap sm:justify-between sm:gap-2.5 sm:px-5">
              <button type="button" onClick={backToList} className="apple-action-secondary inline-flex min-h-12 items-center justify-center px-4 py-2 text-sm max-md:col-span-2 sm:min-h-0">
                목록
              </button>
              {canManageSensitiveAdmin(user?.role) && (
                <button type="button" onClick={() => setEditingAuthor(true)} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
                  작성자 변경
                </button>
              )}
              {editingAuthor && canManageSensitiveAdmin(user?.role) && <AuthorChangeDialog name={selectedNotice.author} allowMemberSelection onClose={() => setEditingAuthor(false)} onSave={handleAuthorEdit} />}
              {(isAdmin || canEditNotice(user, selectedNotice)) && (
                <>
                  {isAdmin &&
                  <button type="button" onClick={handlePinSelected} disabled={pinning} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold disabled:opacity-50 max-md:col-span-2 sm:min-h-0">
                    {selectedNotice.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    {selectedNotice.pinned ? '고정 해제' : '고정'}
                  </button>}
                  {canEditNotice(user, selectedNotice) && <button type="button" onClick={() => setMode('edit')} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
                    <Pencil size={14} />
                    수정
                  </button>}
                  {canDeleteNotice(permissions) && <button type="button" onClick={deleteSelected} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 sm:min-h-0">
                    <Trash2 size={14} />
                    삭제
                  </button>}
                </>
              )}
            </div>
          </article>
        )}
      </section>
    </div>
  )
}
