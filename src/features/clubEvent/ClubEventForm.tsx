export default function ClubEventForm({ eventForm, setEventForm, onSubmit, onCancel, saving }) {
  return (
    <form onSubmit={onSubmit} className="club-event-admin-form" aria-label="이벤트 열기">
      <label className="club-event-field club-event-field-wide">
        <span>이벤트 제목</span>
        <input value={eventForm.title} onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))} maxLength={120} placeholder="예: 회지 인기투표" />
      </label>
      <label className="club-event-field">
        <span>투표 시작일</span>
        <input type="date" value={eventForm.startsOn} onChange={(event) => setEventForm((prev) => ({ ...prev, startsOn: event.target.value }))} />
      </label>
      <label className="club-event-field">
        <span>투표 종료일</span>
        <input type="date" value={eventForm.endsOn} onChange={(event) => setEventForm((prev) => ({ ...prev, endsOn: event.target.value }))} />
      </label>
      <label className="club-event-field club-event-field-wide">
        <span>설명</span>
        <textarea value={eventForm.description} onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} maxLength={500} placeholder="투표 안내와 기준을 적어주세요." />
      </label>
      <div className="club-event-form-actions">
        <button type="submit" className="apple-action-primary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" disabled={saving || !eventForm.title.trim() || !eventForm.startsOn || !eventForm.endsOn}>
          {saving ? '여는 중...' : '이벤트 열기'}
        </button>
        <button type="button" className="apple-action-secondary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" onClick={onCancel} disabled={saving}>
          취소
        </button>
      </div>
    </form>
  )
}
