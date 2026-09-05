import { useState } from 'react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import {
  createClubEvent,
  deleteClubEvent,
  deleteClubEventEntry,
  getClubEvent,
  rsvpClubEvent,
  uploadClubEventEntry,
  voteClubEventEntry,
} from '../../services/clubEventApi'
import { normalizeRichTextForSubmit } from '../../shared/homeUi'
import ClubEventDetail from './ClubEventDetail'
import ClubEventForm from './ClubEventForm'
import ClubEventListCard from './ClubEventListCard'
import { CLUB_EVENT_RSVP_OPTIONS, toEventDateTime } from './clubEventUtils'
import { useClubEventEntryForm } from './useClubEventEntryForm'
import { useClubEvents } from './useClubEvents'
import { canManageContent } from '../../utils/roleAccess'
import { usePermissions } from '../../contexts/usePermissions'

function ClubEventSection() {
  const navigate = useNavigate()
  const { user, authLoading, events, loading, loadError, prependEvent, mergeEvent, removeEvent } = useClubEvents('이벤트를 불러오지 못했습니다.')
  const { permissions } = usePermissions()
  const [mode, setMode] = useState('list')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  const [eventForm, setEventForm] = useState({ title: '', description: '', startsOn: '', endsOn: '' })
  const {
    entryForm,
    setEntryForm,
    entryFiles,
    setEntryFiles,
    entryDragActive,
    setEntryDragActive,
    resetEntryForm,
    entryFileSizeTotal,
    entryImageFiles,
    entryDocumentFiles,
    replaceEntryFileGroup,
    addEntryFiles,
    removeEntryFileAt,
    handleEntryDrop,
  } = useClubEventEntryForm()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [votingEntryId, setVotingEntryId] = useState(null)
  const [rsvpPending, setRsvpPending] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const eventItems = user ? events || [] : []
  const selectedEvent = selectedEventId == null
    ? null
    : eventItems.find((item) => item.id === selectedEventId) || selectedSnapshot
  const isLocked = !authLoading && !user
  const isAdmin = canManageContent(permissions)
  const visibleError = error || loadError

  const resetEventForm = () => {
    setEventForm({ title: '', description: '', startsOn: '', endsOn: '' })
  }

  const openEvent = async (item) => {
    setMode('detail')
    setSelectedEventId(item.id)
    setSelectedSnapshot(item)
    setNotice('')
    setError('')
    try {
      const detail = await getClubEvent(item.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
    } catch (err) {
      setError(err.message || '이벤트 상세를 불러오지 못했습니다.')
    }
  }

  const submitEvent = async (event) => {
    event.preventDefault()
    if (!eventForm.title.trim() || !eventForm.startsOn || !eventForm.endsOn) return
    setSavingEvent(true)
    setNotice('')
    setError('')
    try {
      const created = await createClubEvent({
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        startsAt: toEventDateTime(eventForm.startsOn),
        endsAt: toEventDateTime(eventForm.endsOn, true),
      })
      prependEvent(created)
      setSelectedEventId(created.id)
      setSelectedSnapshot(created)
      setMode('detail')
      resetEventForm()
      setNotice('이벤트를 열었습니다. 이제 회지와 작품을 업로드할 수 있습니다.')
    } catch (err) {
      setError(err.message || '이벤트를 만들지 못했습니다.')
    } finally {
      setSavingEvent(false)
    }
  }

  const submitEntry = async (event) => {
    event.preventDefault()
    if (!selectedEvent || !entryForm.title.trim() || entryFiles.length === 0) return
    const form = event.currentTarget
    setSavingEntry(true)
    setNotice('')
    setError('')
    try {
      await uploadClubEventEntry(selectedEvent.id, {
        title: entryForm.title.trim(),
        authorName: entryForm.authorName.trim(),
        description: normalizeRichTextForSubmit(entryForm.description),
        workType: entryForm.workType,
        summary: entryForm.summary.trim(),
        tags: entryForm.tags.trim(),
        externalUrl: entryForm.externalUrl.trim(),
        files: entryFiles,
      })
      const detail = await getClubEvent(selectedEvent.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
      resetEntryForm()
      form.reset()
      setNotice('작품을 이벤트에 등록했습니다.')
    } catch (err) {
      setError(err.message || '회지 글을 등록하지 못했습니다.')
    } finally {
      setSavingEntry(false)
    }
  }

  const handleVote = async (entry) => {
    if (!selectedEvent || votingEntryId) return
    setVotingEntryId(entry.id)
    setNotice('')
    setError('')
    try {
      const updated = await voteClubEventEntry(selectedEvent.id, entry.id)
      mergeEvent(updated)
      setSelectedSnapshot(updated)
      setNotice(`${entry.title}에 투표했습니다.`)
    } catch (err) {
      setError(err.message || '투표하지 못했습니다.')
    } finally {
      setVotingEntryId(null)
    }
  }

  const handleRsvp = async (status) => {
    if (!selectedEvent || rsvpPending) return
    setRsvpPending(status)
    setNotice('')
    setError('')
    try {
      const updated = await rsvpClubEvent(selectedEvent.id, status)
      mergeEvent(updated)
      setSelectedSnapshot(updated)
      const label = CLUB_EVENT_RSVP_OPTIONS.find((option) => option.value === status)?.label || ''
      setNotice(`참석 여부를 '${label}'(으)로 표시했습니다.`)
    } catch (err) {
      setError(err.message || '참석 여부를 저장하지 못했습니다.')
    } finally {
      setRsvpPending(null)
    }
  }

  const handleDeleteEvent = async (item) => {
    if (!(await confirmDialog({ message: `${item.title} 이벤트를 삭제할까요?`, tone: 'danger' }))) return
    setDeletingId(`event-${item.id}`)
    setError('')
    try {
      await deleteClubEvent(item.id)
      removeEvent(item.id)
      if (selectedEventId === item.id) {
        setSelectedEventId(null)
        setSelectedSnapshot(null)
        setMode('list')
      }
    } catch (err) {
      setError(err.message || '이벤트를 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteEntry = async (entry) => {
    if (!selectedEvent || !(await confirmDialog({ message: `${entry.title} 작품을 삭제할까요?`, tone: 'danger' }))) return
    setDeletingId(`entry-${entry.id}`)
    setError('')
    try {
      await deleteClubEventEntry(selectedEvent.id, entry.id)
      const detail = await getClubEvent(selectedEvent.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
    } catch (err) {
      setError(err.message || '작품을 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section id="activity-events" className="club-event-section scroll-mt-24 bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="activity-board-shell apple-board-shell">
          {mode === 'list' && (
            <>
              <div className="club-event-hero px-4 py-7 sm:px-8 sm:py-10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="apple-eyebrow">Event</p>
                    <h1 className="apple-display mt-3 break-words text-4xl sm:text-6xl">이벤트</h1>
                    <p className="apple-copy mt-4 max-w-2xl text-base sm:text-lg">회지, 작품, 활동 결과물을 모아 투표하고 랭킹으로 확인합니다. 등록된 실제 이벤트만 보여줍니다.</p>
                  </div>
                  {isAdmin && !isLocked && (
                    <button type="button" onClick={() => { setMode('write'); setError(''); setNotice('') }} className="apple-action-primary inline-flex w-full items-center justify-center px-5 py-3 text-sm sm:w-auto sm:py-2.5">
                      이벤트 열기
                    </button>
                  )}
                </div>
              </div>
              {authLoading || loading ? (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>이벤트를 불러오는 중...</h3>
                    <p>회원 상태와 진행 중인 투표를 확인하고 있습니다.</p>
                  </div>
                </div>
              ) : isLocked ? (
                <div className="activity-empty-state activity-locked-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>로그인 하세요</h3>
                    <p>회원 로그인 후 이벤트와 인기투표에 참여할 수 있습니다.</p>
                    <button type="button" onClick={() => navigate('/login')} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">로그인</button>
                  </div>
                </div>
              ) : visibleError ? (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>이벤트를 불러오지 못했습니다.</h3>
                    <p>{visibleError}</p>
                  </div>
                </div>
              ) : eventItems.length > 0 ? (
                <div className="club-event-list">
                  {eventItems.map((item) => (
                    <ClubEventListCard
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      deletingId={deletingId}
                      onOpen={openEvent}
                      onDelete={handleDeleteEvent}
                    />
                  ))}
                </div>
              ) : (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>열린 이벤트가 없습니다.</h3>
                    <p>관리자가 회지 인기투표나 작품 이벤트를 열면 이곳에 표시됩니다.</p>
                  </div>
                </div>
              )}
            </>
          )}
          {mode === 'write' && (
            <>
              <div className="apple-board-minibar px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--app-muted)]">
                    <span className="text-[var(--app-accent-text)]">Event</span>
                    <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
                    <h1 className="text-xs font-semibold text-[var(--app-muted)]">이벤트 열기</h1>
                  </div>
                  <button type="button" onClick={() => setMode('list')} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                    <ArrowLeft size={14} />
                    목록
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <ClubEventForm eventForm={eventForm} setEventForm={setEventForm} onSubmit={submitEvent} onCancel={() => setMode('list')} saving={savingEvent} />
              </div>
            </>
          )}
          {mode === 'detail' && (
            <ClubEventDetail
              selectedEvent={selectedEvent}
              notice={notice}
              error={error}
              rsvpPending={rsvpPending}
              onRsvp={handleRsvp}
              isAdmin={isAdmin}
              entryForm={entryForm}
              setEntryForm={setEntryForm}
              entryFiles={entryFiles}
              setEntryFiles={setEntryFiles}
              entryDragActive={entryDragActive}
              setEntryDragActive={setEntryDragActive}
              entryImageFiles={entryImageFiles}
              entryDocumentFiles={entryDocumentFiles}
              entryFileSizeTotal={entryFileSizeTotal}
              savingEntry={savingEntry}
              onSubmitEntry={submitEntry}
              addEntryFiles={addEntryFiles}
              removeEntryFileAt={removeEntryFileAt}
              replaceEntryFileGroup={replaceEntryFileGroup}
              handleEntryDrop={handleEntryDrop}
              votingEntryId={votingEntryId}
              onVote={handleVote}
              deletingId={deletingId}
              onDeleteEntry={handleDeleteEntry}
              onBack={() => setMode('list')}
            />
          )}
          {mode !== 'detail' && (notice || error) && <div className={`club-event-toast ${error ? 'club-event-toast-error' : ''}`}>{error || notice}</div>}
        </div>
      </div>
    </section>
  )
}

export default ClubEventSection
