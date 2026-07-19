import { CLUB_EVENT_RSVP_OPTIONS } from './clubEventUtils'

export default function ClubEventRsvpPanel({ selectedEvent, rsvpPending, onRsvp }) {
  return (
    <div className="club-event-rsvp" aria-label="참석 여부">
      <p className="club-event-rsvp-label">참석 여부</p>
      <div className="club-event-rsvp-group" role="group" aria-label="참석 여부 선택">
        {CLUB_EVENT_RSVP_OPTIONS.map((option) => {
          const count = Number(selectedEvent[option.countKey]) || 0
          const selected = selectedEvent.myRsvpStatus === option.value
          const pending = rsvpPending === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onRsvp(option.value)}
              disabled={Boolean(rsvpPending)}
              aria-pressed={selected}
              aria-label={`${option.label} ${count}명${selected ? ' (선택됨)' : ''}`}
              className={`club-event-rsvp-button ${selected ? 'club-event-rsvp-button-selected' : ''} ${pending ? 'club-event-rsvp-button-pending' : ''}`}
            >
              <span className="club-event-rsvp-button-name">{option.label}</span>
              <span className="club-event-rsvp-button-count">{pending ? '...' : count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
