import { ArrowLeft, Sparkles } from 'lucide-react'
import { RichTextContent } from '../../shared/RichText'
import ClubEventEntryCard from './ClubEventEntryCard'
import ClubEventEntryForm from './ClubEventEntryForm'
import ClubEventRsvpPanel from './ClubEventRsvpPanel'
import { formatEventWindow } from './clubEventUtils'

export default function ClubEventDetail({
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
  if (!selectedEvent) return <p className="px-4 py-16 text-center text-sm text-[var(--app-muted)]">이벤트를 여는 중...</p>
  const entries = Array.isArray(selectedEvent.entries) ? selectedEvent.entries : []
  return (
    <>
      <div className="club-event-detail-head">
        <button type="button" className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm" onClick={onBack}>
          <ArrowLeft size={14} />
          목록
        </button>
        <div className="club-event-detail-title">
          <p className="apple-eyebrow">Event contest</p>
          <h2>{selectedEvent.title}</h2>
          {selectedEvent.description && <RichTextContent value={selectedEvent.description} className="club-event-detail-description" />}
        </div>
        <div className="club-event-status-card">
          <span className={selectedEvent.votingOpen ? 'club-event-status-open' : 'club-event-status-closed'}>{selectedEvent.votingOpen ? '투표 진행 중' : '투표 종료'}</span>
          <strong>{selectedEvent.totalVotes ?? 0}표</strong>
          <small>{formatEventWindow(selectedEvent)}</small>
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
      {entries.length > 0 ? (
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
            <h3>아직 업로드된 작품이 없습니다.</h3>
            <p>관리자가 회지나 작품 파일을 추가하면 랭킹이 이곳에 표시됩니다.</p>
          </div>
        </div>
      )}
    </>
  )
}
