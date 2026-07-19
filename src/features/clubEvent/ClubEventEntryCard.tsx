import { Download, ExternalLink, FileText, Tag, ThumbsUp, Trash2 } from 'lucide-react'
import { RichTextContent } from '../../shared/RichText'
import { clubEventEntryTags, clubEventWorkTypeLabel, formatFileSize } from './clubEventUtils'

export default function ClubEventEntryCard({ entry, votingOpen, isAdmin, votingEntryId, deletingId, onVote, onDelete }) {
  const entryFileList = Array.isArray(entry.files) && entry.files.length > 0
    ? entry.files
    : (entry.downloadUrl ? [{
        id: `${entry.id}-legacy-file`,
        downloadUrl: entry.downloadUrl,
        originalName: entry.originalName,
        fileSize: entry.fileSize,
      }] : [])
  const tags = clubEventEntryTags(entry.tags)
  const workTypeLabel = clubEventWorkTypeLabel(entry.workType)
  return (
    <article className={`club-event-entry-card ${entry.myVote ? 'club-event-entry-card-selected' : ''}`}>
      <div className="club-event-rank-badge">{entry.rank}위</div>
      <div className="club-event-entry-main">
        <div className="club-event-entry-title-row">
          <h3>{entry.title}</h3>
          {workTypeLabel && <span className="club-event-work-type"><FileText size={13} aria-hidden="true" /> {workTypeLabel}</span>}
          {entry.authorName && <span>{entry.authorName}</span>}
          {entryFileList.length > 1 && <span>첨부 {entryFileList.length}개</span>}
        </div>
        {entry.summary && <p className="club-event-entry-summary">{entry.summary}</p>}
        {tags.length > 0 && (
          <div className="club-event-entry-tags" aria-label={`${entry.title} 태그`}>
            {tags.map((tag) => (
              <span key={tag}><Tag size={12} aria-hidden="true" />{tag}</span>
            ))}
          </div>
        )}
        {entry.description && <RichTextContent value={entry.description} className="club-event-entry-description" />}
        {entry.externalUrl && (
          <a href={entry.externalUrl} className="club-event-entry-external" target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            관련 링크
          </a>
        )}
        {entryFileList.length > 0 && (
          <div className="club-event-entry-files" aria-label={`${entry.title} 첨부파일`}>
            {entryFileList.map((file) => (
              <a key={file.id || file.downloadUrl || file.originalName} href={file.downloadUrl} className="club-event-download-link">
                <Download size={14} aria-hidden="true" />
                <span>{file.originalName || '첨부파일'}</span>
                {formatFileSize(file.fileSize) && <small>{formatFileSize(file.fileSize)}</small>}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="club-event-entry-score">
        <strong>{entry.voteCount ?? 0}표</strong>
        <button type="button" onClick={() => onVote(entry)} disabled={!votingOpen || votingEntryId === entry.id} className={entry.myVote ? 'club-event-vote-button club-event-vote-button-selected' : 'club-event-vote-button'}>
          <ThumbsUp size={15} aria-hidden="true" />
          {entry.myVote ? '내 투표' : '투표'}
        </button>
        {isAdmin && (
          <button type="button" onClick={() => onDelete(entry)} disabled={deletingId === `entry-${entry.id}`} className="club-event-danger-button" aria-label={`${entry.title} 삭제`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  )
}
