import { FileText, ImagePlus, Paperclip, Upload, X } from 'lucide-react'
import { RichTextComposer } from '../../shared/RichText'
import { CLUB_EVENT_WORK_TYPE_OPTIONS, formatFileSize } from './clubEventUtils'

export default function ClubEventEntryForm({
  isAdmin,
  selectedEvent,
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
  onSubmit,
  addEntryFiles,
  removeEntryFileAt,
  replaceEntryFileGroup,
  handleEntryDrop,
}) {
  if (!isAdmin || !selectedEvent) return null
  return (
    <form onSubmit={onSubmit} className="club-event-entry-form community-compose-form grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" aria-label="이벤트 회지 글쓰기">
      <div className="community-compose-meta club-event-entry-side order-5 flex flex-wrap gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-4">
        <p className="activity-community-board-label w-full">작품 정보</p>
        <label className="club-event-field">
          <span>작성자/팀</span>
          <input value={entryForm.authorName} onChange={(event) => setEntryForm((prev) => ({ ...prev, authorName: event.target.value }))} maxLength={80} placeholder="예: 운영팀" />
        </label>
        <label className="club-event-field">
          <span>작품 종류</span>
          <select value={entryForm.workType} onChange={(event) => setEntryForm((prev) => ({ ...prev, workType: event.target.value }))}>
            {CLUB_EVENT_WORK_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="club-event-field">
          <span>한줄 소개</span>
          <textarea value={entryForm.summary} onChange={(event) => setEntryForm((prev) => ({ ...prev, summary: event.target.value }))} maxLength={500} rows={3} placeholder="작품을 짧게 소개해주세요." />
        </label>
        <label className="club-event-field">
          <span>태그</span>
          <input value={entryForm.tags} onChange={(event) => setEntryForm((prev) => ({ ...prev, tags: event.target.value }))} maxLength={500} placeholder="예: 봄호, 웹진, 신입생" />
        </label>
        <label className="club-event-field">
          <span>관련 링크</span>
          <input value={entryForm.externalUrl} onChange={(event) => setEntryForm((prev) => ({ ...prev, externalUrl: event.target.value }))} maxLength={500} placeholder="https://..." />
        </label>
        <div className="activity-compose-attachment-summary">
          <span><ImagePlus size={14} aria-hidden="true" /> 이미지 {entryImageFiles.length}개</span>
          <span><Paperclip size={14} aria-hidden="true" /> 파일 {entryDocumentFiles.length}개</span>
          {formatFileSize(entryFileSizeTotal) && <span>총 {formatFileSize(entryFileSizeTotal)}</span>}
        </div>
        <div className="activity-compose-side-actions">
          <button type="submit" className="apple-action-primary min-h-11 px-5 py-2.5 text-sm disabled:opacity-50" disabled={savingEntry || !entryForm.title.trim() || entryFiles.length === 0}>
            {savingEntry ? '등록 중...' : '작품 등록'}
          </button>
        </div>
      </div>

      <input
        aria-label="글 제목"
        value={entryForm.title}
        onChange={(event) => setEntryForm((prev) => ({ ...prev, title: event.target.value }))}
        maxLength={120}
        placeholder="제목"
        className="community-compose-title order-1 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-base text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:text-sm lg:col-start-1 lg:row-start-1"
      />

      <div className="order-2 lg:col-start-1 lg:row-start-2">
        <RichTextComposer
          value={entryForm.description}
          onChange={(description) => setEntryForm((prev) => ({ ...prev, description }))}
          imageFiles={entryImageFiles}
          onImageFilesChange={(files) => replaceEntryFileGroup('image', files)}
          fileFiles={entryDocumentFiles}
          onFileFilesChange={(files) => replaceEntryFileGroup('document', files)}
          minHeight="24rem"
        />
      </div>

      <div
        className={`club-event-upload-panel order-3 lg:col-start-1 lg:row-start-3 ${entryDragActive ? 'club-event-upload-panel-active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setEntryDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setEntryDragActive(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setEntryDragActive(false)
        }}
        onDrop={handleEntryDrop}
      >
        <div className="club-event-upload-copy">
          <Upload size={22} aria-hidden="true" />
          <div>
            <strong>작품 첨부 추가</strong>
            <span>이미지는 이미지 버튼으로, PDF·ZIP·원본은 첨부파일 버튼으로 여러 개 올릴 수 있습니다.</span>
          </div>
        </div>
        <div className="club-event-upload-actions">
          <label className="club-event-upload-button">
            <ImagePlus size={15} aria-hidden="true" />
            이미지
            <input
              aria-label="이벤트 이미지 파일"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={(event) => {
                addEntryFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
          <label className="club-event-upload-button">
            <Paperclip size={15} aria-hidden="true" />
            첨부파일
            <input
              aria-label="회지 작품 첨부파일"
              type="file"
              multiple
              onChange={(event) => {
                addEntryFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      {entryFiles.length > 0 && (
        <div className="club-event-file-basket order-4 lg:col-start-1 lg:row-start-4" aria-label="선택한 작품 파일">
          <div className="club-event-file-basket-head">
            <strong>선택한 첨부 {entryFiles.length}개</strong>
            <span>이미지 {entryImageFiles.length}개 · 파일 {entryDocumentFiles.length}개</span>
            <button type="button" onClick={() => setEntryFiles([])}>전체 삭제</button>
          </div>
          <ul>
            {entryFiles.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                <FileText size={16} aria-hidden="true" />
                <div>
                  <span>{file.name}</span>
                  <small>{[file.type || '파일', formatFileSize(file.size)].filter(Boolean).join(' · ')}</small>
                </div>
                <button type="button" onClick={() => removeEntryFileAt(index)} aria-label={`${file.name} 제거`}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  )
}
