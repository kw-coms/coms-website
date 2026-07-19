import { ThumbsUp } from 'lucide-react'
import { categoryLabel, formatActivityDate } from '../../shared/homeUi'
import { RichTextContent } from '../../shared/RichText'
import { activityImagesFor } from './activityLogUtils'

function ActivityListItem({ item, onOpen }) {
  const itemImages = activityImagesFor(item)
  const previewImage = itemImages[0]?.url || ''
  return (
    <article className="activity-log-card activity-community-row">
      <button type="button" className="activity-community-row-main" onClick={() => onOpen(item)} aria-label={`${item.title} 내용 보기`}>
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
}

export default ActivityListItem
