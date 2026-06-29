import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, ExternalLink, FileText, ImagePlus, Paperclip, Sparkles, Tag, ThumbsUp, Trash2, Upload, X } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import {
  createClubEvent,
  deleteClubEvent,
  deleteClubEventEntry,
  getClubEvent,
  listClubEvents,
  rsvpClubEvent,
  uploadClubEventEntry,
  voteClubEventEntry,
} from '../../services/clubEventApi'
import {
  CLUB_EVENTS_QUERY_KEY,
  normalizeRichTextForSubmit,
} from '../../shared/homeUi'
import { RichTextComposer, RichTextContent } from '../../shared/RichText'

function useClubEvents(loadErrorMessage) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLUB_EVENTS_QUERY_KEY,
    queryFn: async () => {
      const data = await listClubEvents()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })

  const events = query.data ?? null
  const loading = Boolean(user && events === null && !query.error)
  const loadError = query.error ? (query.error.message || loadErrorMessage) : ''

  const prependEvent = (created) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => [created, ...(Array.isArray(prev) ? prev : [])])
  }

  const mergeEvent = (updated) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => {
      const list = Array.isArray(prev) ? prev : []
      const found = list.some((item) => item.id === updated.id)
      return found ? list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) : [updated, ...list]
    })
  }

  const removeEvent = (id) => {
    queryClient.setQueryData(CLUB_EVENTS_QUERY_KEY, (prev) => (Array.isArray(prev) ? prev.filter((item) => item.id !== id) : []))
  }

  return { user, authLoading, events, loading, loadError, prependEvent, mergeEvent, removeEvent }
}

function toEventDateTime(value, endOfDay = false) {
  if (!value) return ''
  return `${value}T${endOfDay ? '23:59:00' : '00:00:00'}`
}

function formatEventDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEventWindow(event) {
  const start = formatEventDateTime(event.startsAt)
  const end = formatEventDateTime(event.endsAt)
  return [start, end].filter(Boolean).join(' ~ ')
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

const EMPTY_CLUB_EVENT_ENTRY_FORM = {
  title: '',
  authorName: '',
  workType: 'MAGAZINE',
  summary: '',
  tags: '',
  externalUrl: '',
  description: '',
}

const CLUB_EVENT_WORK_TYPE_OPTIONS = [
  { value: 'MAGAZINE', label: '회지' },
  { value: 'WEBZINE', label: '웹진' },
  { value: 'SOURCE', label: '원본/소스' },
  { value: 'DESIGN', label: '디자인' },
  { value: 'OTHER', label: '기타 작품' },
]

function clubEventWorkTypeLabel(value) {
  return CLUB_EVENT_WORK_TYPE_OPTIONS.find((option) => option.value === value)?.label || ''
}

const CLUB_EVENT_RSVP_OPTIONS = [
  { value: 'GOING', label: '참석', countKey: 'goingCount' },
  { value: 'MAYBE', label: '미정', countKey: 'maybeCount' },
  { value: 'NOT_GOING', label: '불참', countKey: 'notGoingCount' },
]

function clubEventEntryTags(value) {
  return String(value || '')
    .split(/[,\n#]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function mergeFileList(currentFiles, nextFiles) {
  const merged = [...(currentFiles || [])]
  const seen = new Set(merged.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
  for (const file of Array.from(nextFiles || []) as any[]) {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (!seen.has(key)) {
      merged.push(file)
      seen.add(key)
    }
  }
  return merged
}

function isEventImageFile(file) {
  const type = String(file?.type || '').toLowerCase()
  const name = String(file?.name || '').toLowerCase()
  return type.startsWith('image/') || /\.(avif|gif|jpe?g|png|webp)$/i.test(name)
}

function ClubEventSection() {
  const navigate = useNavigate()
  const { user, authLoading, events, loading, loadError, prependEvent, mergeEvent, removeEvent } = useClubEvents('이벤트를 불러오지 못했습니다.')
  const [mode, setMode] = useState('list')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  const [eventForm, setEventForm] = useState({ title: '', description: '', startsOn: '', endsOn: '' })
  const [entryForm, setEntryForm] = useState(() => ({ ...EMPTY_CLUB_EVENT_ENTRY_FORM }))
  const [entryFiles, setEntryFiles] = useState([])
  const [entryDragActive, setEntryDragActive] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [votingEntryId, setVotingEntryId] = useState(null)
  const [rsvpPending, setRsvpPending] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const eventItems = user ? events || [] : []
  const selectedEvent = selectedEventId == null
    ? null
    : eventItems.find((item) => item.id === selectedEventId) || selectedSnapshot
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'
  const visibleError = error || loadError

  const resetEventForm = () => {
    setEventForm({ title: '', description: '', startsOn: '', endsOn: '' })
  }

  const resetEntryForm = () => {
    setEntryForm({ ...EMPTY_CLUB_EVENT_ENTRY_FORM })
    setEntryFiles([])
    setEntryDragActive(false)
  }

  const entryFileSizeTotal = useMemo(
    () => entryFiles.reduce((total, file) => total + (Number(file.size) || 0), 0),
    [entryFiles],
  )
  const entryImageFiles = useMemo(() => entryFiles.filter(isEventImageFile), [entryFiles])
  const entryDocumentFiles = useMemo(() => entryFiles.filter((file) => !isEventImageFile(file)), [entryFiles])

  const replaceEntryFileGroup = useCallback((group, nextFiles) => {
    setEntryFiles((current) => {
      const normalizedNext = Array.from(nextFiles || [])
      const kept = current.filter((file) => (group === 'image' ? !isEventImageFile(file) : isEventImageFile(file)))
      return group === 'image' ? [...normalizedNext, ...kept] : [...kept, ...normalizedNext]
    })
  }, [])

  const addEntryFiles = (files) => {
    const nextFiles = Array.from(files || [])
    if (nextFiles.length === 0) return
    setEntryFiles((current) => mergeFileList(current, nextFiles))
  }

  const removeEntryFileAt = (index) => {
    setEntryFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleEntryDrop = (event) => {
    event.preventDefault()
    setEntryDragActive(false)
    addEntryFiles(event.dataTransfer.files)
  }

  const openEvent = async (item) => {
    setMode('detail')
    setSelectedEventId(item.id)
    setSelectedSnapshot(item)
    setNotice('')
    setError('')
    try {
      const detail = await getClubEvent(item.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
    } catch (err) {
      setError(err.message || '이벤트 상세를 불러오지 못했습니다.')
    }
  }

  const submitEvent = async (event) => {
    event.preventDefault()
    if (!eventForm.title.trim() || !eventForm.startsOn || !eventForm.endsOn) return
    setSavingEvent(true)
    setNotice('')
    setError('')
    try {
      const created = await createClubEvent({
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        startsAt: toEventDateTime(eventForm.startsOn),
        endsAt: toEventDateTime(eventForm.endsOn, true),
      })
      prependEvent(created)
      setSelectedEventId(created.id)
      setSelectedSnapshot(created)
      setMode('detail')
      resetEventForm()
      setNotice('이벤트를 열었습니다. 이제 회지와 작품을 업로드할 수 있습니다.')
    } catch (err) {
      setError(err.message || '이벤트를 만들지 못했습니다.')
    } finally {
      setSavingEvent(false)
    }
  }

  const submitEntry = async (event) => {
    event.preventDefault()
    if (!selectedEvent || !entryForm.title.trim() || entryFiles.length === 0) return
    const form = event.currentTarget
    setSavingEntry(true)
    setNotice('')
    setError('')
    try {
      await uploadClubEventEntry(selectedEvent.id, {
        title: entryForm.title.trim(),
        authorName: entryForm.authorName.trim(),
        description: normalizeRichTextForSubmit(entryForm.description),
        workType: entryForm.workType,
        summary: entryForm.summary.trim(),
        tags: entryForm.tags.trim(),
        externalUrl: entryForm.externalUrl.trim(),
        files: entryFiles,
      })
      const detail = await getClubEvent(selectedEvent.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
      resetEntryForm()
      form.reset()
      setNotice('작품을 이벤트에 등록했습니다.')
    } catch (err) {
      setError(err.message || '회지 글을 등록하지 못했습니다.')
    } finally {
      setSavingEntry(false)
    }
  }

  const handleVote = async (entry) => {
    if (!selectedEvent || votingEntryId) return
    setVotingEntryId(entry.id)
    setNotice('')
    setError('')
    try {
      const updated = await voteClubEventEntry(selectedEvent.id, entry.id)
      mergeEvent(updated)
      setSelectedSnapshot(updated)
      setNotice(`${entry.title}에 투표했습니다.`)
    } catch (err) {
      setError(err.message || '투표하지 못했습니다.')
    } finally {
      setVotingEntryId(null)
    }
  }

  const handleRsvp = async (status) => {
    if (!selectedEvent || rsvpPending) return
    setRsvpPending(status)
    setNotice('')
    setError('')
    try {
      const updated = await rsvpClubEvent(selectedEvent.id, status)
      mergeEvent(updated)
      setSelectedSnapshot(updated)
      const label = CLUB_EVENT_RSVP_OPTIONS.find((option) => option.value === status)?.label || ''
      setNotice(`참석 여부를 '${label}'(으)로 표시했습니다.`)
    } catch (err) {
      setError(err.message || '참석 여부를 저장하지 못했습니다.')
    } finally {
      setRsvpPending(null)
    }
  }

  const handleDeleteEvent = async (item) => {
    if (!window.confirm(`${item.title} 이벤트를 삭제할까요?`)) return
    setDeletingId(`event-${item.id}`)
    setError('')
    try {
      await deleteClubEvent(item.id)
      removeEvent(item.id)
      if (selectedEventId === item.id) {
        setSelectedEventId(null)
        setSelectedSnapshot(null)
        setMode('list')
      }
    } catch (err) {
      setError(err.message || '이벤트를 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteEntry = async (entry) => {
    if (!selectedEvent || !window.confirm(`${entry.title} 작품을 삭제할까요?`)) return
    setDeletingId(`entry-${entry.id}`)
    setError('')
    try {
      await deleteClubEventEntry(selectedEvent.id, entry.id)
      const detail = await getClubEvent(selectedEvent.id)
      mergeEvent(detail)
      setSelectedSnapshot(detail)
    } catch (err) {
      setError(err.message || '작품을 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const renderEventForm = () => (
    <form onSubmit={submitEvent} className="club-event-admin-form" aria-label="이벤트 열기">
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
        <button type="submit" className="apple-action-primary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" disabled={savingEvent || !eventForm.title.trim() || !eventForm.startsOn || !eventForm.endsOn}>
          {savingEvent ? '여는 중...' : '이벤트 열기'}
        </button>
        <button type="button" className="apple-action-secondary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm" onClick={() => setMode('list')} disabled={savingEvent}>
          취소
        </button>
      </div>
    </form>
  )

  const renderEntryForm = () => {
    if (!isAdmin || !selectedEvent) return null
    return (
      <form onSubmit={submitEntry} className="club-event-entry-form community-compose-form grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" aria-label="이벤트 회지 글쓰기">
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

  const renderDetail = () => {
    if (!selectedEvent) return <p className="px-4 py-16 text-center text-sm text-[var(--app-muted)]">이벤트를 여는 중...</p>
    const entries = Array.isArray(selectedEvent.entries) ? selectedEvent.entries : []
    return (
      <>
        <div className="club-event-detail-head">
          <button type="button" className="apple-action-secondary inline-flex items-center gap-1 px-4 py-2 text-sm" onClick={() => setMode('list')}>
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
                  onClick={() => handleRsvp(option.value)}
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
        {(notice || error) && <div className={`club-event-toast mx-4 mt-4 ${error ? 'club-event-toast-error' : ''}`}>{error || notice}</div>}
        {renderEntryForm()}
        {entries.length > 0 ? (
          <div className="club-event-ranking-list">
            {entries.map((entry) => {
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
                <article key={entry.id} className={`club-event-entry-card ${entry.myVote ? 'club-event-entry-card-selected' : ''}`}>
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
                    <button type="button" onClick={() => handleVote(entry)} disabled={!selectedEvent.votingOpen || votingEntryId === entry.id} className={entry.myVote ? 'club-event-vote-button club-event-vote-button-selected' : 'club-event-vote-button'}>
                      <ThumbsUp size={15} aria-hidden="true" />
                      {entry.myVote ? '내 투표' : '투표'}
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => handleDeleteEntry(entry)} disabled={deletingId === `entry-${entry.id}`} className="club-event-danger-button" aria-label={`${entry.title} 삭제`}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
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

  return (
    <section id="activity-events" className="club-event-section scroll-mt-24 bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="activity-board-shell apple-board-shell">
          {mode === 'list' && (
            <>
              <div className="club-event-hero px-4 py-7 sm:px-8 sm:py-10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="apple-eyebrow">Event</p>
                    <h1 className="apple-display mt-3 break-words text-4xl sm:text-6xl">이벤트</h1>
                    <p className="apple-copy mt-4 max-w-2xl text-base sm:text-lg">회지, 작품, 활동 결과물을 모아 투표하고 랭킹으로 확인합니다. 등록된 실제 이벤트만 보여줍니다.</p>
                  </div>
                  {isAdmin && !isLocked && (
                    <button type="button" onClick={() => { setMode('write'); setError(''); setNotice('') }} className="apple-action-primary inline-flex w-full items-center justify-center px-5 py-3 text-sm sm:w-auto sm:py-2.5">
                      이벤트 열기
                    </button>
                  )}
                </div>
              </div>
              {authLoading || loading ? (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>이벤트를 불러오는 중...</h3>
                    <p>회원 상태와 진행 중인 투표를 확인하고 있습니다.</p>
                  </div>
                </div>
              ) : isLocked ? (
                <div className="activity-empty-state activity-locked-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>로그인 하세요</h3>
                    <p>회원 로그인 후 이벤트와 인기투표에 참여할 수 있습니다.</p>
                    <button type="button" onClick={() => navigate('/login')} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">로그인</button>
                  </div>
                </div>
              ) : visibleError ? (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>이벤트를 불러오지 못했습니다.</h3>
                    <p>{visibleError}</p>
                  </div>
                </div>
              ) : eventItems.length > 0 ? (
                <div className="club-event-list">
                  {eventItems.map((item) => (
                    <article key={item.id} className="club-event-list-card">
                      <button type="button" onClick={() => openEvent(item)} className="club-event-list-button">
                        <span className={item.votingOpen ? 'club-event-pill club-event-pill-open' : 'club-event-pill'}>{item.votingOpen ? '진행 중' : '종료'}</span>
                        <strong>{item.title}</strong>
                        {item.description && <RichTextContent value={item.description} className="club-event-list-description" />}
                        <small>{formatEventWindow(item)}</small>
                      </button>
                      <div className="club-event-list-stats">
                        <span>{item.entryCount ?? 0}작품</span>
                        <span>{item.totalVotes ?? 0}표</span>
                        {isAdmin && (
                          <button type="button" onClick={() => handleDeleteEvent(item)} disabled={deletingId === `event-${item.id}`} className="club-event-danger-button" aria-label={`${item.title} 이벤트 삭제`}>
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="activity-empty-state m-4 sm:m-8">
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h3>열린 이벤트가 없습니다.</h3>
                    <p>관리자가 회지 인기투표나 작품 이벤트를 열면 이곳에 표시됩니다.</p>
                  </div>
                </div>
              )}
            </>
          )}
          {mode === 'write' && (
            <>
              <div className="apple-board-minibar px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--app-muted)]">
                    <span className="text-[var(--app-accent-text)]">Event</span>
                    <span className="size-1 rounded-full bg-[var(--app-subtle)]" />
                    <h1 className="text-xs font-semibold text-[var(--app-muted)]">이벤트 열기</h1>
                  </div>
                  <button type="button" onClick={() => setMode('list')} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
                    <ArrowLeft size={14} />
                    목록
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-5">{renderEventForm()}</div>
            </>
          )}
          {mode === 'detail' && renderDetail()}
          {mode !== 'detail' && (notice || error) && <div className={`club-event-toast ${error ? 'club-event-toast-error' : ''}`}>{error || notice}</div>}
        </div>
      </div>
    </section>
  )
}

export default ClubEventSection
