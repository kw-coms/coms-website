import { Trash2 } from 'lucide-react'
import { RichTextContent } from '../../shared/RichText'
import { formatEventWindow } from './clubEventUtils'

export default function ClubEventListCard({ item, isAdmin, deletingId, onOpen, onDelete }) {
  return (
    <article className="club-event-list-card">
      <button type="button" onClick={() => onOpen(item)} className="club-event-list-button">
        <span className={item.votingOpen ? 'club-event-pill club-event-pill-open' : 'club-event-pill'}>{item.votingOpen ? '진행 중' : '종료'}</span>
        <strong>{item.title}</strong>
        {item.description && <RichTextContent value={item.description} className="club-event-list-description" />}
        <small>{formatEventWindow(item)}</small>
      </button>
      <div className="club-event-list-stats">
        <span>{item.entryCount ?? 0}작품</span>
        <span>{item.totalVotes ?? 0}표</span>
        {isAdmin && (
          <button type="button" onClick={() => onDelete(item)} disabled={deletingId === `event-${item.id}`} className="club-event-danger-button" aria-label={`${item.title} 이벤트 삭제`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  )
}
