import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, ThumbsUp, X } from 'lucide-react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import {
  deleteClubActivity,
  updateClubActivity,
  uploadClubActivityImages,
  voteClubActivity,
} from '../../services/clubActivityApi'
import { CLUB_ACTIVITIES_QUERY_KEY, categoryLabel, formatActivityDate, normalizeRichTextForSubmit } from '../../shared/homeUi'
import { RichTextComposer, RichTextContent } from '../../shared/RichText'
import { activityImagesFor } from './activityLogUtils'

function ActivityDetailModal({
  activity,
  categories,
  user,
  isAdmin,
  modalRef,
  onClose,
  mergeActivity,
  removeActivity,
  setSubmitError,
  setActivityNotice,
}) {
  const queryClient = useQueryClient()
  const [votingId, setVotingId] = useState(null)
  const [activityEditor, setActivityEditor] = useState(null)
  const [editImages, setEditImages] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingActivity, setDeletingActivity] = useState(false)

  const selectedEditorCategory = activityEditor?.category || categories[0]?.key || ''

  const startActivityEdit = () => {
    if (!activity) return
    setActivityEditor({
      title: activity.title || '',
      eventDate: activity.eventDate || '',
      category: activity.category || categories[0]?.key || '',
      description: activity.description || '',
    })
    setEditImages([])
    setSubmitError('')
  }

  const saveActivityEdit = async (event) => {
    event.preventDefault()
    if (!activity || !activityEditor?.title.trim() || !activityEditor.eventDate) return
    setSavingEdit(true)
    setSubmitError('')
    try {
      const updated = await updateClubActivity(activity.id, {
        kind: 'ACTIVITY',
        category: selectedEditorCategory,
        title: activityEditor.title.trim(),
        description: normalizeRichTextForSubmit(activityEditor.description),
        eventDate: activityEditor.eventDate,
      })
      mergeActivity(updated)
      if (editImages.length > 0) {
        await uploadClubActivityImages(activity.id, editImages)
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
    if (!activity || deletingActivity) return
    if (!(await confirmDialog({ message: '이 활동 기록을 삭제할까요?', tone: 'danger' }))) return
    setDeletingActivity(true)
    setSubmitError('')
    try {
      await deleteClubActivity(activity.id)
      removeActivity(activity.id)
      onClose()
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
    <div className="activity-detail-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <article
        ref={modalRef}
        className="activity-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-title"
      >
        <header className="activity-detail-header">
          <div>
            <p className="activity-detail-eyebrow">
              {categoryLabel(activity.category, activity.categoryName)} · {formatActivityDate(activity.eventDate)}
            </p>
            <h3 id="activity-detail-title">{activity.title}</h3>
            <p>{activity.createdByName || 'COM\'s'} 작성</p>
          </div>
          <button type="button" className="activity-detail-close" onClick={onClose} aria-label="활동 기록 닫기">
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
            {activityImagesFor(activity).length > 0 && (
              <div className="activity-detail-gallery" aria-label="활동 사진">
                {activityImagesFor(activity).map((image, index) => (
                  <img key={image.id || image.url || index} src={image.url} alt={image.originalName || `활동 사진 ${index + 1}`} loading="lazy" decoding="async" />
                ))}
              </div>
            )}
            {activity.description && (
              <RichTextContent value={activity.description} className="activity-detail-description" />
            )}
            {(activity.fileInfos?.length ?? 0) > 0 && (
              <ul className="activity-detail-files">
                {activity.fileInfos.map((file) => (
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
              <span>조회 {activity.viewCount ?? 0}</span>
              <button
                type="button"
                onClick={() => handleActivityVote(activity)}
                disabled={votingId === activity.id}
                className={activity.myVote === 1 ? 'is-active' : ''}
              >
                <ThumbsUp size={15} aria-hidden="true" />
                개추 {activity.upvotes ?? 0}
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
    </div>
  )
}

export default ActivityDetailModal
