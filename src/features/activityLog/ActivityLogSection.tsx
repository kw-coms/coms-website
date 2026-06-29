import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Download, ImagePlus, Paperclip, Plus, Settings2, Sparkles, ThumbsUp, X } from 'lucide-react'
import {
  createClubActivity,
  createClubActivityCategory,
  deleteClubActivity,
  deleteClubActivityCategory,
  getClubActivity,
  updateClubActivity,
  updateClubActivityCategory,
  uploadClubActivityFile,
  uploadClubActivityImages,
  voteClubActivity,
} from '../../services/clubActivityApi'
import { useModalFocus } from '../../hooks/useModalFocus'
import {
  CLUB_ACTIVITIES_QUERY_KEY,
  CLUB_ACTIVITY_CATEGORIES_QUERY_KEY,
  categoryLabel,
  formatActivityDate,
  normalizeRichTextForSubmit,
  richTextToPlainText,
  useClubActivities,
  useClubActivityCategories,
} from '../../shared/homeUi'
import { RichTextComposer, RichTextContent } from '../../shared/RichText'

function ActivityLogSection({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity } = useClubActivities('활동 기록을 불러오지 못했습니다.')
  const categories = useClubActivityCategories()
  const [votingId, setVotingId] = useState(null)
  const [viewedIds] = useState(() => new Set())
  const [submitError, setSubmitError] = useState('')
  const error = submitError || loadError
  const [activityMode, setActivityMode] = useState('list')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [categoryEditName, setCategoryEditName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [categoryNotice, setCategoryNotice] = useState('')
  const [activityForm, setActivityForm] = useState({
    title: '',
    eventDate: '',
    category: '',
    description: '',
  })
  const [activityImages, setActivityImages] = useState([])
  const [activityFiles, setActivityFiles] = useState([])
  const [savingActivity, setSavingActivity] = useState(false)
  const [activityNotice, setActivityNotice] = useState('')
  const [selectedActivityId, setSelectedActivityId] = useState(null)
  const [activityEditor, setActivityEditor] = useState(null)
  const [editImages, setEditImages] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingActivity, setDeletingActivity] = useState(false)
  // Search + filter state (mirrors notices/resources/community list patterns).
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Default the composer category to the first admin-managed category without
  // a state-syncing effect (the dropdown is controlled by this derived value).
  const selectedCategory = activityForm.category || categories[0]?.key || ''

  const allActivityItems = (user ? records || [] : []).filter((item) => item.kind === 'ACTIVITY')
  const normalizedSearch = searchText.trim().toLowerCase()
  const filteredItems = allActivityItems.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false
    if (fromDate && (item.eventDate || '') < fromDate) return false
    if (toDate && (item.eventDate || '') > toDate) return false
    if (normalizedSearch) {
      const haystack = `${item.title || ''} ${richTextToPlainText(item.description) || ''} ${item.createdByName || ''}`.toLowerCase()
      if (!haystack.includes(normalizedSearch)) return false
    }
    return true
  })
  const visibleItems = compact ? filteredItems.slice(0, 3) : filteredItems
  const selectedActivity = allActivityItems.find((item) => item.id === selectedActivityId) || null
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'
  const hasActiveFilters = Boolean(normalizedSearch) || categoryFilter !== 'ALL' || Boolean(fromDate) || Boolean(toDate)
  const selectedEditorCategory = activityEditor?.category || categories[0]?.key || ''

  const refreshActivityCategories = async () => {
    await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITY_CATEGORIES_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
  }

  const addActivityCategory = async (event) => {
    event.preventDefault()
    if (!newCategoryName.trim() || categoryBusy) return
    setCategoryBusy(true)
    setCategoryError('')
    setCategoryNotice('')
    try {
      const created = await createClubActivityCategory({ name: newCategoryName.trim() })
      setNewCategoryName('')
      setActivityForm((prev) => ({ ...prev, category: created?.key || prev.category }))
      await refreshActivityCategories()
      setCategoryNotice('분류를 추가했습니다.')
    } catch (err) {
      setCategoryError(err.message || '분류를 추가하지 못했습니다.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const startCategoryRename = (category) => {
    setEditingCategoryId(category.id)
    setCategoryEditName(category.name || '')
    setCategoryError('')
    setCategoryNotice('')
  }

  const saveActivityCategory = async (category) => {
    if (!categoryEditName.trim() || categoryBusy) return
    setCategoryBusy(true)
    setCategoryError('')
    setCategoryNotice('')
    try {
      await updateClubActivityCategory(category.id, { name: categoryEditName.trim() })
      setEditingCategoryId(null)
      setCategoryEditName('')
      await refreshActivityCategories()
      setCategoryNotice('분류 이름을 변경했습니다.')
    } catch (err) {
      setCategoryError(err.message || '분류를 수정하지 못했습니다.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const removeActivityCategory = async (category) => {
    if (categoryBusy) return
    if (!window.confirm(`'${category.name}' 분류를 삭제할까요?`)) return
    setCategoryBusy(true)
    setCategoryError('')
    setCategoryNotice('')
    try {
      await deleteClubActivityCategory(category.id)
      if (activityForm.category === category.key) {
        setActivityForm((prev) => ({ ...prev, category: '' }))
      }
      await refreshActivityCategories()
      setCategoryNotice('분류를 삭제했습니다.')
    } catch (err) {
      setCategoryError(err.message || '분류를 삭제하지 못했습니다.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const activityImagesFor = (item) => {
    const infos = Array.isArray(item?.imageInfos) ? item.imageInfos.filter((image) => image?.url) : []
    if (infos.length > 0) return infos
    if (item?.imageUrl) {
      return [{
        id: `${item.id}-legacy-image`,
        url: item.imageUrl,
        originalName: item.imageOriginalName || '활동 사진',
      }]
    }
    return []
  }

  const submitActivity = async (event) => {
    event.preventDefault()
    if (!activityForm.title.trim() || !activityForm.eventDate || !selectedCategory) return
    const form = event.currentTarget
    setSavingActivity(true)
    setActivityNotice('')
    setSubmitError('')
    try {
      const created = await createClubActivity({
        kind: 'ACTIVITY',
        category: selectedCategory,
        title: activityForm.title.trim(),
        description: normalizeRichTextForSubmit(activityForm.description),
        eventDate: activityForm.eventDate,
      })
      prependActivity(created)
      if (activityImages.length > 0) {
        await uploadClubActivityImages(created.id, activityImages)
      }
      if (activityFiles.length > 0) {
        for (const file of activityFiles) {
          await uploadClubActivityFile(created.id, file)
        }
      }
      if (activityImages.length > 0 || activityFiles.length > 0) {
        await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
      }
      setActivityNotice('활동 글을 등록했습니다.')
      setActivityForm((prev) => ({ ...prev, title: '', eventDate: '', description: '' }))
      setActivityImages([])
      setActivityFiles([])
      setActivityMode('list')
      form.reset()
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 추가하지 못했습니다.')
    } finally {
      setSavingActivity(false)
    }
  }

  // Register a view once per activity per mount when the card is opened.
  const registerActivityView = async (item) => {
    if (!user || viewedIds.has(item.id)) return
    viewedIds.add(item.id)
    try {
      const detail = await getClubActivity(item.id)
      mergeActivity(detail)
    } catch {
      viewedIds.delete(item.id)
    }
  }

  const openActivityDetail = (item) => {
    setSelectedActivityId(item.id)
    setActivityEditor(null)
    setEditImages([])
    setSubmitError('')
    registerActivityView(item)
  }

  const closeActivityDetail = () => {
    setSelectedActivityId(null)
    setActivityEditor(null)
    setEditImages([])
    setSavingEdit(false)
    setDeletingActivity(false)
  }

  const activityModalRef = useModalFocus(Boolean(selectedActivity), closeActivityDetail)

  const startActivityEdit = () => {
    if (!selectedActivity) return
    setActivityEditor({
      title: selectedActivity.title || '',
      eventDate: selectedActivity.eventDate || '',
      category: selectedActivity.category || categories[0]?.key || '',
      description: selectedActivity.description || '',
    })
    setEditImages([])
    setSubmitError('')
  }

  const saveActivityEdit = async (event) => {
    event.preventDefault()
    if (!selectedActivity || !activityEditor?.title.trim() || !activityEditor.eventDate) return
    setSavingEdit(true)
    setSubmitError('')
    try {
      const updated = await updateClubActivity(selectedActivity.id, {
        kind: 'ACTIVITY',
        category: selectedEditorCategory,
        title: activityEditor.title.trim(),
        description: normalizeRichTextForSubmit(activityEditor.description),
        eventDate: activityEditor.eventDate,
      })
      mergeActivity(updated)
      if (editImages.length > 0) {
        await uploadClubActivityImages(selectedActivity.id, editImages)
        await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
      }
      setActivityEditor(null)
      setEditImages([])
      setActivityNotice('활동 기록을 수정했습니다.')
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 수정하지 못했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteSelectedActivity = async () => {
    if (!selectedActivity || deletingActivity) return
    if (!window.confirm('이 활동 기록을 삭제할까요?')) return
    setDeletingActivity(true)
    setSubmitError('')
    try {
      await deleteClubActivity(selectedActivity.id)
      removeActivity(selectedActivity.id)
      closeActivityDetail()
      setActivityNotice('활동 기록을 삭제했습니다.')
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 삭제하지 못했습니다.')
    } finally {
      setDeletingActivity(false)
    }
  }

  const handleActivityVote = async (item) => {
    if (!user || votingId) return
    setVotingId(item.id)
    try {
      const updated = await voteClubActivity(item.id, item.myVote === 1 ? 0 : 1)
      mergeActivity(updated)
    } catch (err) {
      setSubmitError(err.message || '추천 중 오류가 발생했습니다.')
    } finally {
      setVotingId(null)
    }
  }

  return (
    <>
      <section id="activity-log" className={`activity-proof-section ${compact ? 'activity-proof-section-compact' : ''} scroll-mt-24 bg-[var(--app-surface)] px-5 py-12 sm:py-16`}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.62fr_1fr] lg:items-end">
            <div>
              <p className="apple-eyebrow">Activity log</p>
              <h2 className="apple-display mt-3 text-4xl sm:text-5xl">실제로 이어지는 활동 기록</h2>
              <p className="apple-copy mt-4 max-w-2xl text-lg">
                신입생이 가장 먼저 궁금해하는 것은 지금도 활동이 이어지는지입니다. 검증된 활동 사진과 기록이 등록되면 날짜, 활동명, 후기 흐름으로 보여줍니다.
              </p>
            </div>
            <div className="activity-proof-note apple-soft-panel px-5 py-5">
              <p className="text-sm font-semibold text-[var(--app-text)]">기록 방식</p>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--app-muted)]">
                세미나, 스터디, 프로젝트 발표, MT/행사, 수상/성과처럼 실제 확인된 항목만 활동 로그에 노출합니다.
              </p>
            </div>
          </div>

          {!compact && isAdmin && !isLocked && activityMode === 'list' && (
            <div className="activity-community-toolbar mt-8">
              <div>
                <p className="activity-community-board-label">Activity board</p>
                <p>활동 기록을 커뮤니티 글처럼 작성하고 목록에서 바로 열람합니다.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setCategoryManagerOpen((open) => !open)} className="apple-action-secondary inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 text-sm">
                  <Settings2 size={15} aria-hidden="true" />
                  분류 관리
                </button>
                <button type="button" onClick={() => { setActivityMode('write'); setSubmitError(''); setActivityNotice('') }} className="apple-action-primary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm">
                  글쓰기
                </button>
              </div>
            </div>
          )}

          {!compact && isAdmin && !isLocked && categoryManagerOpen && activityMode === 'list' && (
            <div className="activity-category-manager mt-4" aria-label="활동 분류 관리">
              <div className="activity-category-manager-head">
                <div>
                  <p className="activity-community-board-label">분류 설정</p>
                  <h3>활동 분류 관리</h3>
                </div>
                <button type="button" onClick={() => setCategoryManagerOpen(false)} className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-1 px-3 py-2 text-sm">
                  <X size={14} aria-hidden="true" />
                  닫기
                </button>
              </div>

              <form onSubmit={addActivityCategory} className="activity-category-add-form">
                <label>
                  <span>새 분류 이름</span>
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    maxLength={60}
                    placeholder="예: 해커톤"
                  />
                </label>
                <button type="submit" disabled={categoryBusy || !newCategoryName.trim()} className="apple-action-primary inline-flex min-h-11 items-center justify-center gap-1 px-4 py-2.5 text-sm">
                  <Plus size={14} aria-hidden="true" />
                  분류 추가
                </button>
              </form>

              <ul className="activity-category-list">
                {categories.map((category) => (
                  <li key={category.key}>
                    {editingCategoryId === category.id ? (
                      <div className="activity-category-edit-row">
                        <input
                          aria-label={`${category.name} 이름`}
                          value={categoryEditName}
                          onChange={(event) => setCategoryEditName(event.target.value)}
                          maxLength={60}
                        />
                        <button type="button" onClick={() => saveActivityCategory(category)} disabled={categoryBusy || !categoryEditName.trim()}>
                          저장
                        </button>
                        <button type="button" onClick={() => { setEditingCategoryId(null); setCategoryEditName('') }}>
                          취소
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="activity-category-name">
                          <strong>{category.name}</strong>
                          <span>{category.key} · 사용 {category.activityCount ?? 0}건</span>
                        </div>
                        <div className="activity-category-actions">
                          <button type="button" onClick={() => startCategoryRename(category)} disabled={categoryBusy || !category.id}>
                            이름 변경
                          </button>
                          <button type="button" onClick={() => removeActivityCategory(category)} disabled={categoryBusy || !category.id}>
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {categoryNotice && <p className="activity-community-notice mt-3">{categoryNotice}</p>}
              {categoryError && <p className="community-compose-error mt-3 text-sm font-semibold text-red-500">{categoryError}</p>}
            </div>
          )}

          {!compact && activityMode === 'write' && (
            <form onSubmit={submitActivity} className="activity-community-compose community-compose-form mt-8 grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" aria-label="활동 글쓰기">
              <div className="community-compose-meta activity-compose-side-card order-3 flex flex-wrap gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-3">
                <p className="activity-community-board-label w-full">게시 설정</p>
                <label className="activity-community-side-field">
                  <span>분류</span>
                  <select
                    aria-label="분류"
                    value={selectedCategory}
                    onChange={(event) => setActivityForm((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="activity-community-side-field">
                  <span>활동 날짜</span>
                  <input
                    aria-label="활동 날짜"
                    type="date"
                    value={activityForm.eventDate}
                    onChange={(event) => setActivityForm((prev) => ({ ...prev, eventDate: event.target.value }))}
                  />
                </label>
                <div className="activity-compose-attachment-summary">
                  <span><ImagePlus size={14} aria-hidden="true" /> 이미지 {activityImages.length}개</span>
                  <span><Paperclip size={14} aria-hidden="true" /> 첨부 {activityFiles.length}개</span>
                </div>
                {submitError && <p className="community-compose-error text-sm font-semibold text-red-500">{submitError}</p>}
                <div className="activity-compose-side-actions">
                  <button type="submit" disabled={savingActivity || !activityForm.title.trim() || !activityForm.eventDate || !selectedCategory} className="apple-action-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50">
                    {savingActivity ? '저장 중...' : '글 등록'}
                  </button>
                  <button type="button" disabled={savingActivity} onClick={() => setActivityMode('list')} className="apple-action-secondary min-h-11 px-5 py-2.5 text-sm">
                    취소
                  </button>
                </div>
              </div>

              <input
                aria-label="제목"
                value={activityForm.title}
                onChange={(event) => setActivityForm((prev) => ({ ...prev, title: event.target.value }))}
                maxLength={120}
                placeholder="제목"
                className="community-compose-title order-1 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-1 lg:row-start-1"
              />

              <div className="order-2 lg:col-start-1 lg:row-start-2">
                <RichTextComposer
                  value={activityForm.description}
                  onChange={(description) => setActivityForm((prev) => ({ ...prev, description }))}
                  imageFiles={activityImages}
                  onImageFilesChange={setActivityImages}
                  fileFiles={activityFiles}
                  onFileFilesChange={setActivityFiles}
                  minHeight="26rem"
                />
              </div>

            </form>
          )}

          {activityMode === 'list' && activityNotice && (
            <div className="activity-community-notice mt-4" role="status">{activityNotice}</div>
          )}

          {activityMode === 'list' && !compact && !isLocked && !authLoading && !loading && !loadError && (
            <div className="activity-log-filters mt-8 flex flex-wrap items-end gap-3">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>검색</span>
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="제목, 내용, 작성자로 검색"
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>분류</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                >
                  <option value="ALL">전체 분류</option>
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>시작일</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
                <span>종료일</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]"
                />
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearchText(''); setCategoryFilter('ALL'); setFromDate(''); setToDate('') }}
                  className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[var(--app-accent-text)] transition hover:bg-[var(--app-surface-soft)]"
                >
                  필터 초기화
                </button>
              )}
            </div>
          )}

          {activityMode === 'list' && (authLoading || loading ? (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>활동 기록을 불러오는 중...</h3>
                <p>회원 상태와 등록된 활동 기록을 확인하고 있습니다.</p>
              </div>
            </div>
          ) : isLocked ? (
            <div className="activity-empty-state activity-locked-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>로그인 하세요</h3>
                <p>회원 로그인 후 활동 기록과 일정을 확인할 수 있습니다.</p>
                <button type="button" onClick={() => navigate('/login')} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">
                  로그인
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>활동 기록을 불러오지 못했습니다.</h3>
                <p>{error}</p>
              </div>
            </div>
          ) : visibleItems.length > 0 ? (
            <div className="activity-community-list activity-log-grid mt-8">
              <div className="activity-community-table-head" aria-hidden="true">
                <span>활동일</span>
                <span>글</span>
                <span>작성자</span>
                <span>반응</span>
                <span>미디어</span>
              </div>
              {visibleItems.map((item) => {
                const itemImages = activityImagesFor(item)
                const previewImage = itemImages[0]?.url || ''
                return (
                  <article key={item.id} className="activity-log-card activity-community-row">
                    <button type="button" className="activity-community-row-main" onClick={() => openActivityDetail(item)} aria-label={`${item.title} 내용 보기`}>
                      <span className="activity-community-row-index">{formatActivityDate(item.eventDate)}</span>
                      <div className="activity-community-row-content">
                        <div className="activity-community-row-meta">
                          <span>{categoryLabel(item.category, item.categoryName)}</span>
                          {itemImages.length > 0 && <span>사진 {itemImages.length}장</span>}
                          {(item.fileInfos?.length ?? 0) > 0 && <span>첨부 {item.fileInfos.length}개</span>}
                        </div>
                        <h3>{item.title}</h3>
                        {item.description && <RichTextContent value={item.description} className="activity-community-row-excerpt" />}
                      </div>
                      <span className="activity-community-row-author">{item.createdByName || 'COM\'s'}</span>
                      <span className="activity-community-row-reactions">
                        <span>조회 {item.viewCount ?? 0}</span>
                        <span><ThumbsUp size={13} aria-hidden="true" /> 개추 {item.upvotes ?? 0}</span>
                      </span>
                      <span className="activity-community-row-preview">
                        {previewImage ? (
                          <>
                            <img src={previewImage} alt="" className="activity-log-image activity-community-row-thumb" loading="lazy" decoding="async" />
                            <span>사진</span>
                          </>
                        ) : (
                          <span>없음</span>
                        )}
                      </span>
                    </button>
                  </article>
                )
              })}
            </div>
          ) : hasActiveFilters ? (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>검색 결과가 없습니다.</h3>
                <p>다른 검색어나 필터 조건으로 다시 시도해보세요.</p>
              </div>
            </div>
          ) : (
            <div className="activity-empty-state mt-8">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h3>등록된 활동 기록이 없습니다.</h3>
                <p>확인된 활동 사진, 후기, 성과 기록이 추가되면 이 영역에 바로 표시됩니다.</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedActivity && createPortal(
        <div className="activity-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeActivityDetail()
        }}>
          <article
            ref={activityModalRef}
            className="activity-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-detail-title"
          >
            <header className="activity-detail-header">
              <div>
                <p className="activity-detail-eyebrow">
                  {categoryLabel(selectedActivity.category, selectedActivity.categoryName)} · {formatActivityDate(selectedActivity.eventDate)}
                </p>
                <h3 id="activity-detail-title">{selectedActivity.title}</h3>
                <p>{selectedActivity.createdByName || 'COM\'s'} 작성</p>
              </div>
              <button type="button" className="activity-detail-close" onClick={closeActivityDetail} aria-label="활동 기록 닫기">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {activityEditor ? (
              <form onSubmit={saveActivityEdit} className="activity-detail-editor" aria-label="활동 기록 수정">
                <label>
                  <span>활동 제목</span>
                  <input
                    value={activityEditor.title}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, title: event.target.value }))}
                    maxLength={120}
                  />
                </label>
                <label>
                  <span>활동 날짜</span>
                  <input
                    type="date"
                    value={activityEditor.eventDate}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, eventDate: event.target.value }))}
                  />
                </label>
                <label>
                  <span>활동 분류</span>
                  <select
                    value={selectedEditorCategory}
                    onChange={(event) => setActivityEditor((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <div className="activity-detail-editor-wide">
                  <span>활동 내용</span>
                  <RichTextComposer
                    value={activityEditor.description}
                    onChange={(description) => setActivityEditor((prev) => ({ ...prev, description }))}
                    editorLabel="활동 내용"
                    imageFiles={editImages}
                    onImageFilesChange={setEditImages}
                    minHeight="14rem"
                  />
                </div>
                <div className="activity-detail-editor-actions">
                  <button type="button" className="activity-detail-secondary" onClick={() => setActivityEditor(null)} disabled={savingEdit}>
                    취소
                  </button>
                  <button type="submit" disabled={savingEdit || !activityEditor.title.trim() || !activityEditor.eventDate}>
                    {savingEdit ? '저장 중...' : '수정 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {activityImagesFor(selectedActivity).length > 0 && (
                  <div className="activity-detail-gallery" aria-label="활동 사진">
                    {activityImagesFor(selectedActivity).map((image, index) => (
                      <img key={image.id || image.url || index} src={image.url} alt="" loading="lazy" decoding="async" />
                    ))}
                  </div>
                )}
                {selectedActivity.description && (
                  <RichTextContent value={selectedActivity.description} className="activity-detail-description" />
                )}
                {(selectedActivity.fileInfos?.length ?? 0) > 0 && (
                  <ul className="activity-detail-files">
                    {selectedActivity.fileInfos.map((file) => (
                      <li key={file.id}>
                        <a href={file.url}>
                          <Download size={14} aria-hidden="true" />
                          {file.originalName || '첨부파일'}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="activity-detail-actions">
                  <span>조회 {selectedActivity.viewCount ?? 0}</span>
                  <button
                    type="button"
                    onClick={() => handleActivityVote(selectedActivity)}
                    disabled={votingId === selectedActivity.id}
                    className={selectedActivity.myVote === 1 ? 'is-active' : ''}
                  >
                    <ThumbsUp size={15} aria-hidden="true" />
                    개추 {selectedActivity.upvotes ?? 0}
                  </button>
                  {isAdmin && (
                    <div className="activity-detail-admin-actions">
                      <button type="button" onClick={startActivityEdit}>수정</button>
                      <button type="button" onClick={deleteSelectedActivity} disabled={deletingActivity}>
                        {deletingActivity ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        </div>,
        document.body,
      )}
    </>
  )
}

export default ActivityLogSection
