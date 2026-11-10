import { ArrowLeft, Link2, Sparkles } from 'lucide-react'
import { showToast } from '../../components/common/Toast'
import { RichTextContent } from '../../shared/RichText'
import ClubEventEntryCard from './ClubEventEntryCard'
import ClubEventEntryForm from './ClubEventEntryForm'
import ClubEventRsvpPanel from './ClubEventRsvpPanel'
import { formatEventWindow, isContestEvent } from './clubEventUtils'

export default function ClubEventDetail({
  notFound,
  selectedEvent,
  notice,
  error,
  rsvpPending,
  onRsvp,
  isAdmin,
  entryForm,
  setEntryForm,
  entryFiles,
  setEntryFiles,
  entryDragActive,
  setEntryDragActive,
  entryImageFiles,
  entryDocumentFiles,
  entryFileSizeTotal,
  savingEntry,
  onSubmitEntry,
  addEntryFiles,
  removeEntryFileAt,
  replaceEntryFileGroup,
  handleEntryDrop,
  votingEntryId,
  onVote,
  deletingId,
  onDeleteEntry,
  onBack,
}) {
  if (notFound) {
    return (
      <div className="activity-empty-state m-4 sm:m-8" role="alert">
        <Sparkles size={22} aria-hidden="true" />
        <div>
          <h3>이벤트를 찾을 수 없습니다.</h3>
          <p>삭제되었거나 주소가 잘못되었을 수 있습니다.</p>
          <button type="button" onClick={onBack} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">이벤트 목록으로</button>
        </div>
      </div>
    )
  }
  if (!selectedEvent) return <p className="px-4 py-16 text-center text-sm text-[var(--app-muted)]">이벤트를 여는 중...</p>
  const entries = Array.isArray(selectedEvent.entries) ? selectedEvent.entries : []
  const contest = isContestEvent(selectedEvent)
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast({ message: '링크를 복사했습니다.', tone: 'success' })
    } catch {
      showToast({ message: '복사하지 못했습니다. 주소창의 주소를 복사해 주세요.', tone: 'error' })
    }
  }
  return (
    <>
      <div className="club-event-detail-head">
        <button type="button" className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm" onClick={onBack}>
          <ArrowLeft size={14} />
          목록
        </button>
        <div className="club-event-detail-title">
          <p className="apple-eyebrow">{contest ? 'Event contest' : 'Event'}</p>
          <h2>{selectedEvent.title}</h2>
          {selectedEvent.description && <RichTextContent value={selectedEvent.description} className="club-event-detail-description" />}
        </div>
        <div className="club-event-status-card">
          {contest ? (
            <>
              <span className={selectedEvent.votingOpen ? 'club-event-status-open' : 'club-event-status-closed'}>{selectedEvent.votingOpen ? '투표 진행 중' : '투표 종료'}</span>
              <strong>{selectedEvent.totalVotes ?? 0}표</strong>
            </>
          ) : null}
          <small>{formatEventWindow(selectedEvent)}</small>
          <button type="button" onClick={copyLink} className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-1.5 px-3 text-sm">
            <Link2 size={14} aria-hidden="true" />
            링크 복사
          </button>
        </div>
      </div>
      <ClubEventRsvpPanel selectedEvent={selectedEvent} rsvpPending={rsvpPending} onRsvp={onRsvp} />
      {(notice || error) && <div className={`club-event-toast mx-4 mt-4 ${error ? 'club-event-toast-error' : ''}`}>{error || notice}</div>}
      <ClubEventEntryForm
        isAdmin={isAdmin}
        selectedEvent={selectedEvent}
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
        onSubmit={onSubmitEntry}
        addEntryFiles={addEntryFiles}
        removeEntryFileAt={removeEntryFileAt}
        replaceEntryFileGroup={replaceEntryFileGroup}
        handleEntryDrop={handleEntryDrop}
      />
      {!contest ? null : entries.length > 0 ? (
        <div className="club-event-ranking-list">
          {entries.map((entry) => (
            <ClubEventEntryCard
              key={entry.id}
              entry={entry}
              votingOpen={selectedEvent.votingOpen}
              isAdmin={isAdmin}
              votingEntryId={votingEntryId}
              deletingId={deletingId}
              onVote={onVote}
              onDelete={onDeleteEntry}
            />
          ))}
        </div>
      ) : (
        <div className="activity-empty-state m-4 sm:m-8">
          <Sparkles size={22} aria-hidden="true" />
          <div>
            <h3>아직 등록된 작품이 없습니다.</h3>
            <p>운영진이 작품을 등록하면 랭킹이 이곳에 표시됩니다.</p>
          </div>
        </div>
      )}
    </>
  )
}
