import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Settings2, Sparkles } from 'lucide-react'
import { getClubActivity } from '../../services/clubActivityApi'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useClubActivities, useClubActivityCategories } from '../../shared/homeUi'
import ActivityCategoryManager from './ActivityCategoryManager'
import ActivityComposer from './ActivityComposer'
import ActivityDetailModal from './ActivityDetailModal'
import ActivityFilterBar from './ActivityFilterBar'
import ActivityListItem from './ActivityListItem'
import { useActivityFilters } from './useActivityFilters'

function ActivityLogSection({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity } = useClubActivities('활동 기록을 불러오지 못했습니다.')
  const categories = useClubActivityCategories()
  const [viewedIds] = useState(() => new Set())
  const [submitError, setSubmitError] = useState('')
  const error = submitError || loadError
  const [activityMode, setActivityMode] = useState('list')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [activityForm, setActivityForm] = useState({
    title: '',
    eventDate: '',
    category: '',
    description: '',
  })
  // Attachment drafts live here (not in ActivityComposer) so toggling back to
  // list view doesn't unmount them away while the text draft survives.
  const [activityImages, setActivityImages] = useState([])
  const [activityFiles, setActivityFiles] = useState([])
  const [activityNotice, setActivityNotice] = useState('')
  const [selectedActivityId, setSelectedActivityId] = useState(null)

  const allActivityItems = (user ? records || [] : []).filter((item) => item.kind === 'ACTIVITY')
  const {
    searchText,
    setSearchText,
    categoryFilter,
    setCategoryFilter,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    visibleItems,
    hasActiveFilters,
  } = useActivityFilters(allActivityItems, compact)
  const selectedActivity = allActivityItems.find((item) => item.id === selectedActivityId) || null
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'

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
    setSubmitError('')
    registerActivityView(item)
  }

  const closeActivityDetail = () => {
    setSelectedActivityId(null)
  }

  const activityModalRef = useModalFocus(Boolean(selectedActivity), closeActivityDetail)

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
            <ActivityCategoryManager
              categories={categories}
              activityFormCategory={activityForm.category}
              onCategoryCreated={(key) => setActivityForm((prev) => ({ ...prev, category: key || prev.category }))}
              onCategoryFormReset={() => setActivityForm((prev) => ({ ...prev, category: '' }))}
              onClose={() => setCategoryManagerOpen(false)}
            />
          )}

          {!compact && activityMode === 'write' && (
            <ActivityComposer
              categories={categories}
              activityForm={activityForm}
              setActivityForm={setActivityForm}
              activityImages={activityImages}
              setActivityImages={setActivityImages}
              activityFiles={activityFiles}
              setActivityFiles={setActivityFiles}
              prependActivity={prependActivity}
              submitError={submitError}
              setSubmitError={setSubmitError}
              setActivityNotice={setActivityNotice}
              setActivityMode={setActivityMode}
            />
          )}

          {activityMode === 'list' && activityNotice && (
            <div className="activity-community-notice mt-4" role="status">{activityNotice}</div>
          )}

          {activityMode === 'list' && !compact && !isLocked && !authLoading && !loading && !loadError && (
            <ActivityFilterBar
              categories={categories}
              searchText={searchText}
              setSearchText={setSearchText}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              fromDate={fromDate}
              setFromDate={setFromDate}
              toDate={toDate}
              setToDate={setToDate}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={() => { setSearchText(''); setCategoryFilter('ALL'); setFromDate(''); setToDate('') }}
            />
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
              {visibleItems.map((item) => (
                <ActivityListItem key={item.id} item={item} onOpen={openActivityDetail} />
              ))}
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
        <ActivityDetailModal
          activity={selectedActivity}
          categories={categories}
          user={user}
          isAdmin={isAdmin}
          modalRef={activityModalRef}
          onClose={closeActivityDetail}
          mergeActivity={mergeActivity}
          removeActivity={removeActivity}
          setSubmitError={setSubmitError}
          setActivityNotice={setActivityNotice}
        />,
        document.body,
      )}
    </>
  )
}

export default ActivityLogSection
