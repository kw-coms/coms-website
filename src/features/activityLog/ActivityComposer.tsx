import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Paperclip } from 'lucide-react'
import { createClubActivity, uploadClubActivityFile, uploadClubActivityImages } from '../../services/clubActivityApi'
import { CLUB_ACTIVITIES_QUERY_KEY, normalizeRichTextForSubmit } from '../../shared/homeUi'
import { RichTextComposer } from '../../shared/RichText'

function ActivityComposer({
  categories,
  activityForm,
  setActivityForm,
  activityImages,
  setActivityImages,
  activityFiles,
  setActivityFiles,
  prependActivity,
  submitError,
  setSubmitError,
  setActivityNotice,
  setActivityMode,
}) {
  const queryClient = useQueryClient()
  const [savingActivity, setSavingActivity] = useState(false)

  const selectedCategory = activityForm.category || categories[0]?.key || ''

  const submitActivity = async (event) => {
    event.preventDefault()
    if (!activityForm.title.trim() || !activityForm.eventDate || !selectedCategory) return
    const form = event.currentTarget
    setSavingActivity(true)
    setActivityNotice('')
    setSubmitError('')
    try {
      const created = await createClubActivity({
        kind: 'ACTIVITY',
        category: selectedCategory,
        title: activityForm.title.trim(),
        description: normalizeRichTextForSubmit(activityForm.description),
        eventDate: activityForm.eventDate,
      })
      prependActivity(created)
      if (activityImages.length > 0) {
        await uploadClubActivityImages(created.id, activityImages)
      }
      if (activityFiles.length > 0) {
        for (const file of activityFiles) {
          await uploadClubActivityFile(created.id, file)
        }
      }
      if (activityImages.length > 0 || activityFiles.length > 0) {
        await queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
      }
      setActivityNotice('활동 글을 등록했습니다.')
      setActivityForm((prev) => ({ ...prev, title: '', eventDate: '', description: '' }))
      setActivityImages([])
      setActivityFiles([])
      setActivityMode('list')
      form.reset()
    } catch (err) {
      setSubmitError(err.message || '활동 기록을 추가하지 못했습니다.')
    } finally {
      setSavingActivity(false)
    }
  }

  return (
    <form onSubmit={submitActivity} className="activity-community-compose community-compose-form mt-8 grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" aria-label="활동 글쓰기">
      <div className="community-compose-meta activity-compose-side-card order-3 flex flex-wrap gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-3">
        <p className="activity-community-board-label w-full">게시 설정</p>
        <label className="activity-community-side-field">
          <span>분류</span>
          <select
            aria-label="분류"
            value={selectedCategory}
            onChange={(event) => setActivityForm((prev) => ({ ...prev, category: event.target.value }))}
          >
            {categories.map((category) => (
              <option key={category.key} value={category.key}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="activity-community-side-field">
          <span>활동 날짜</span>
          <input
            aria-label="활동 날짜"
            type="date"
            value={activityForm.eventDate}
            onChange={(event) => setActivityForm((prev) => ({ ...prev, eventDate: event.target.value }))}
          />
        </label>
        <div className="activity-compose-attachment-summary">
          <span><ImagePlus size={14} aria-hidden="true" /> 이미지 {activityImages.length}개</span>
          <span><Paperclip size={14} aria-hidden="true" /> 첨부 {activityFiles.length}개</span>
        </div>
        {submitError && <p className="community-compose-error text-sm font-semibold text-red-500">{submitError}</p>}
        <div className="activity-compose-side-actions">
          <button type="submit" disabled={savingActivity || !activityForm.title.trim() || !activityForm.eventDate || !selectedCategory} className="apple-action-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50">
            {savingActivity ? '저장 중...' : '글 등록'}
          </button>
          <button type="button" disabled={savingActivity} onClick={() => setActivityMode('list')} className="apple-action-secondary min-h-11 px-5 py-2.5 text-sm">
            취소
          </button>
        </div>
      </div>

      <input
        aria-label="제목"
        value={activityForm.title}
        onChange={(event) => setActivityForm((prev) => ({ ...prev, title: event.target.value }))}
        maxLength={120}
        placeholder="제목"
        className="community-compose-title order-1 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-1 lg:row-start-1"
      />

      <div className="order-2 lg:col-start-1 lg:row-start-2">
        <RichTextComposer
          value={activityForm.description}
          onChange={(description) => setActivityForm((prev) => ({ ...prev, description }))}
          imageFiles={activityImages}
          onImageFilesChange={setActivityImages}
          fileFiles={activityFiles}
          onFileFilesChange={setActivityFiles}
          minHeight="26rem"
        />
      </div>

    </form>
  )
}

export default ActivityComposer
