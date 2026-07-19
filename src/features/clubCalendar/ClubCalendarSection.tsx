import { useState } from 'react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Download, Repeat, X } from 'lucide-react'
import {
  deleteClubActivity,
  deleteRecurringScheduleException,
  upsertRecurringScheduleException,
} from '../../services/clubActivityApi'
import { buildCalendarDayEvents, buildMonthEventSummary, visibleDayEvents } from '../../utils/monthlyCalendar'
import { buildIcsCalendar } from '../../utils/icsExport'
import { showToast } from '../../components/common/Toast'
import { calendarWeekdays, calendarMonthOptions } from '../../data/homeContent'
import {
  SCHEDULE_OCCURRENCES_QUERY_KEY,
  buildCalendarMonth,
  formatActivityDate,
  parseLocalDate,
  useClubActivities,
  useScheduleOccurrences,
} from '../../shared/homeUi'
import { CalendarScheduleComposer } from './CalendarScheduleComposer'

function ClubCalendarSection({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, authLoading, records, loading, loadError, prependActivity, mergeActivity, removeActivity } = useClubActivities('일정을 불러오지 못했습니다.')
  const initialCalendarDate = new Date()
  const error = loadError
  const [selectedYear, setSelectedYear] = useState(initialCalendarDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(initialCalendarDate.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [editingDateSchedule, setEditingDateSchedule] = useState(null)
  const [calendarNotice, setCalendarNotice] = useState('')
  const [calendarActionError, setCalendarActionError] = useState('')
  const [exceptionEditor, setExceptionEditor] = useState(null)
  const [exceptionSaving, setExceptionSaving] = useState(false)

  const occurrences = useScheduleOccurrences(selectedYear, selectedMonth)
  const scheduleItems = (user ? records || [] : []).filter((item) => item.kind === 'SCHEDULE')
  const calendarMonth = buildCalendarMonth(new Date(selectedYear, selectedMonth, 1))
  const eventsByDay = buildCalendarDayEvents({
    calendarMonth,
    scheduleItems,
    recurringOccurrences: user ? occurrences : [],
  })
  const hasAnyEvent = Object.values(eventsByDay).some((list) => Array.isArray(list) && list.length > 0)
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'
  const selectedDayEvents = selectedDay ? eventsByDay[selectedDay] || [] : []
  const activeSelectedEventId = selectedDayEvents.some((event) => event.id === selectedEventId) ? selectedEventId : null
  const monthSummary = buildMonthEventSummary({
    eventsByDay,
    calendarMonth,
    today: new Date(),
    limit: 3,
  })

  const updateSelectedYear = (value) => {
    const nextYear = Number(value)
    if (!Number.isFinite(nextYear)) return
    setSelectedDay(null)
    setSelectedEventId(null)
    setSelectedYear(Math.min(2100, Math.max(2000, nextYear)))
  }

  const selectCalendarDay = (day) => {
    setSelectedDay(day)
    setSelectedEventId(null)
  }

  const selectCalendarEvent = (day, event) => {
    setSelectedDay(day)
    setSelectedEventId(event.id)
  }

  const refreshOccurrences = () => {
    queryClient.invalidateQueries({ queryKey: SCHEDULE_OCCURRENCES_QUERY_KEY })
  }

  const handleDateCreated = (created) => {
    prependActivity(created)
    const createdDate = parseLocalDate(created.eventDate)
    if (createdDate) {
      setSelectedYear(createdDate.getFullYear())
      setSelectedMonth(createdDate.getMonth())
      setSelectedDay(createdDate.getDate())
      setSelectedEventId(null)
    }
  }

  const handleDateUpdated = (updated) => {
    mergeActivity(updated)
    setEditingDateSchedule(null)
    const updatedDate = parseLocalDate(updated.eventDate)
    if (updatedDate) {
      setSelectedYear(updatedDate.getFullYear())
      setSelectedMonth(updatedDate.getMonth())
      setSelectedDay(updatedDate.getDate())
      setSelectedEventId(null)
    }
  }

  const startDateEdit = (event) => {
    const activity = scheduleItems.find((item) => item.id === event.activityId)
    if (!activity) return
    setEditingDateSchedule(activity)
    setCalendarNotice('')
    setCalendarActionError('')
  }

  const deleteDateSchedule = async (event) => {
    if (!event.activityId) return
    if (!(await confirmDialog({ message: `'${event.title}' 날짜 일정을 삭제할까요?`, tone: 'danger' }))) return
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await deleteClubActivity(event.activityId)
      removeActivity(event.activityId)
      setEditingDateSchedule(null)
      setSelectedEventId(null)
      setCalendarNotice('날짜 일정을 삭제했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '날짜 일정을 삭제하지 못했습니다.')
    }
  }

  const cancelRecurringOccurrence = async (event) => {
    setExceptionSaving(true)
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await upsertRecurringScheduleException(event.recurringScheduleId, event.date, {
        canceled: true,
        startTime: null,
        endTime: null,
      })
      refreshOccurrences()
      setCalendarNotice('이번 주 정기 일정을 취소 처리했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '정기 일정 예외를 저장하지 못했습니다.')
    } finally {
      setExceptionSaving(false)
    }
  }

  const clearRecurringException = async (event) => {
    setExceptionSaving(true)
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await deleteRecurringScheduleException(event.recurringScheduleId, event.date)
      refreshOccurrences()
      setExceptionEditor(null)
      setCalendarNotice('이번 주 예외를 해제했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '정기 일정 예외를 해제하지 못했습니다.')
    } finally {
      setExceptionSaving(false)
    }
  }

  const startExceptionEdit = (event) => {
    setExceptionEditor({
      eventId: event.id,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
    })
    setCalendarNotice('')
    setCalendarActionError('')
  }

  const saveExceptionEdit = async (event) => {
    if (!exceptionEditor) return
    if (exceptionEditor.startTime && exceptionEditor.endTime && exceptionEditor.endTime < exceptionEditor.startTime) {
      setCalendarActionError('종료 시간은 시작 시간 이후여야 합니다.')
      return
    }
    setExceptionSaving(true)
    setCalendarNotice('')
    setCalendarActionError('')
    try {
      await upsertRecurringScheduleException(event.recurringScheduleId, event.date, {
        canceled: false,
        startTime: exceptionEditor.startTime || null,
        endTime: exceptionEditor.endTime || null,
      })
      refreshOccurrences()
      setExceptionEditor(null)
      setCalendarNotice('이번 주 정기 일정 시간을 변경했습니다.')
    } catch (err) {
      setCalendarActionError(err.message || '정기 일정 시간을 변경하지 못했습니다.')
    } finally {
      setExceptionSaving(false)
    }
  }

  const eventMeta = (event) => {
    const rangeLabel = event.range && event.startDate !== event.endDate
      ? `${formatActivityDate(event.startDate)} ~ ${formatActivityDate(event.endDate)}`
      : formatActivityDate(event.date)
    return [rangeLabel, event.timeLabel, event.canceled ? '취소됨' : '', event.recurring ? '정기 모임' : '날짜 일정'].filter(Boolean).join(' · ')
  }

  const exportCalendarIcs = () => {
    // Flatten the visible month, dropping canceled occurrences and the
    // duplicated middle/end segments of multi-day ranges (kept only on the
    // showTitle day) so each event becomes a single VEVENT.
    const events = Object.values(eventsByDay)
      .flatMap((dayEvents) => (Array.isArray(dayEvents) ? dayEvents : []))
      .filter((event) => !event.canceled && !(event.range && !event.showTitle))

    if (events.length === 0) {
      showToast({ message: '내보낼 일정이 없습니다.', tone: 'default' })
      return
    }

    const ics = buildIcsCalendar(events, { calendarName: `COM's 동아리 일정 · ${calendarMonth.title}` })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `coms-calendar-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.ics`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    showToast({ message: `${calendarMonth.title} 일정 ${events.length}개를 .ics로 내보냈습니다.`, tone: 'success' })
  }

  return (
    <section id="monthly-calendar" className={`club-calendar-section ${compact ? 'club-calendar-section-compact' : ''} scroll-mt-24 bg-[var(--app-surface-soft)] px-5 py-12 sm:py-16`}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="apple-eyebrow">Monthly calendar</p>
            <h2 className="apple-display mt-3 text-4xl sm:text-5xl">동아리 일정 캘린더</h2>
            <p className="apple-copy mt-4 max-w-2xl text-lg">
              공지사항 목록만으로 놓치기 쉬운 정기 회의, 세미나, 스터디, 발표, 모집 마감, MT/행사를 월별 흐름으로 확인합니다.
            </p>
          </div>
          <div className="club-calendar-title">
            <CalendarDays size={18} aria-hidden="true" />
            <span>{calendarMonth.title}</span>
          </div>
        </div>
        <div className="club-calendar-controls mt-5" aria-label="달력 년도와 월 선택">
          <label>
            <span>년도</span>
            <input
              type="number"
              min="2000"
              max="2100"
              step="1"
              value={selectedYear}
              onChange={(event) => updateSelectedYear(event.target.value)}
              aria-label="년도 선택"
            />
          </label>
          <label>
            <span>월</span>
            <select
              value={selectedMonth}
              onChange={(event) => {
                setSelectedDay(null)
                setSelectedEventId(null)
                setSelectedMonth(Number(event.target.value))
              }}
              aria-label="월 선택"
            >
              {calendarMonthOptions.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportCalendarIcs}
            disabled={isLocked || !hasAnyEvent}
            className="apple-action-secondary inline-flex min-h-10 items-center justify-center gap-2 px-4 text-sm disabled:opacity-50"
          >
            <Download size={15} aria-hidden="true" />
            캘린더 내보내기 (.ics)
          </button>
        </div>

        {isAdmin && !isLocked && (
          <CalendarScheduleComposer
            key={editingDateSchedule ? `date-edit-${editingDateSchedule.id}` : 'calendar-composer'}
            onDateCreated={handleDateCreated}
            onDateUpdated={handleDateUpdated}
            editingDateSchedule={editingDateSchedule}
            onDateEditDone={() => setEditingDateSchedule(null)}
          />
        )}

        {!isLocked && monthSummary.length > 0 && (
          <div className="calendar-month-summary mt-6" data-testid="calendar-month-summary">
            <div>
              <p>이번 달 예정 일정 {monthSummary.length}개</p>
              <span>{calendarMonth.title}에서 먼저 확인할 일정입니다.</span>
            </div>
            <ul>
              {monthSummary.map((event) => (
                <li key={`summary-${event.id}`}>
                  <strong>{event.title}</strong>
                  <span>{eventMeta(event)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="club-calendar-shell mt-8">
          {!isLocked && monthSummary.length > 0 && (
            <div className="club-calendar-mobile-agenda" data-testid="calendar-mobile-agenda">
              <div>
                <strong>모바일 일정 요약</strong>
                <span>{calendarMonth.title} 일정 {monthSummary.length}개</span>
              </div>
              <ul>
                {monthSummary.map((event) => (
                  <li key={`mobile-summary-${event.id}`}>
                    <span>{parseLocalDate(event.date)?.getDate()}일</span>
                    <strong>{event.title}</strong>
                    <em>{eventMeta(event)}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="club-calendar-weekdays" aria-hidden="true">
            {calendarWeekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="club-calendar-grid">
            {Array.from({ length: calendarMonth.leadingBlanks }, (_, index) => (
              <div key={`leading-${index}`} className="club-calendar-day club-calendar-day-empty" aria-hidden="true" />
            ))}
            {calendarMonth.days.map((day) => {
              const dayEvents = eventsByDay[day] || []
              const { visible, overflowCount } = visibleDayEvents(dayEvents, 3)
              return (
                <div key={day} className={`club-calendar-day ${dayEvents.length ? 'club-calendar-day-active' : ''} ${selectedDay === day ? 'club-calendar-day-selected' : ''}`}>
                  <button
                    type="button"
                    className="club-calendar-day-number"
                    onClick={() => selectCalendarDay(day)}
                    aria-label={`${day}일 일정 보기`}
                    aria-pressed={selectedDay === day}
                  >
                    {day}
                  </button>
                  {selectedDay === day && <span className="club-calendar-day-selected-label" aria-hidden="true">선택한 날짜</span>}
                  <div className="club-calendar-events">
                    {visible.map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        className={`club-calendar-event ${event.range ? `club-calendar-event-range club-calendar-event-range-${event.segment}` : ''} ${event.recurring ? 'club-calendar-event-recurring' : ''} ${event.canceled ? 'club-calendar-event-canceled' : ''} ${activeSelectedEventId === event.id ? 'club-calendar-event-selected' : ''}`}
                        title={[event.title, eventMeta(event)].filter(Boolean).join(' · ')}
                        onClick={() => selectCalendarEvent(day, event)}
                        aria-pressed={activeSelectedEventId === event.id}
                        style={event.colorHex ? { '--calendar-event-color': event.colorHex } as React.CSSProperties : undefined}
                      >
                        {event.recurring && <Repeat size={11} aria-label="반복 일정" className="club-calendar-event-icon" />}
                        <span className="club-calendar-event-title">{event.showTitle ? event.title : ''}</span>
                        {event.showTitle && event.timeLabel && (
                          <span className="club-calendar-event-meta">{event.timeLabel}</span>
                        )}
                        {event.showTitle && event.canceled && (
                          <span className="club-calendar-event-badge">취소됨</span>
                        )}
                        {activeSelectedEventId === event.id && (
                          <span className="club-calendar-event-selected-mark" aria-hidden="true">선택됨</span>
                        )}
                      </button>
                    ))}
                    {overflowCount > 0 && (
                      <button type="button" className="club-calendar-event-overflow" onClick={() => selectCalendarDay(day)}>
                        +{overflowCount}개
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {Array.from({ length: calendarMonth.trailingBlanks }, (_, index) => (
              <div key={`trailing-${index}`} className="club-calendar-day club-calendar-day-empty" aria-hidden="true" />
            ))}
          </div>
          {selectedDay && selectedDayEvents.length > 0 && (
            <div className="calendar-day-detail">
              <div className="calendar-day-detail-header">
                <div>
                  <strong>{calendarMonth.title} {selectedDay}일</strong>
                  <span>{selectedDayEvents.length}개 일정</span>
                </div>
                <button type="button" onClick={() => { setSelectedDay(null); setSelectedEventId(null) }} aria-label="선택한 날짜 닫기">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              <ul>
                {selectedDayEvents.map((event) => (
                  <li
                    key={`detail-${event.id}`}
                    className={`${event.canceled ? 'calendar-day-detail-canceled' : ''} ${activeSelectedEventId === event.id ? 'calendar-day-detail-selected' : ''}`}
                    style={event.colorHex ? { '--calendar-event-color': event.colorHex } as React.CSSProperties : undefined}
                  >
                    <span className="calendar-day-detail-dot" aria-hidden="true" />
                    <div>
                      <div className="calendar-day-detail-title-row">
                        <strong>{event.title}</strong>
                        {activeSelectedEventId === event.id && (
                          <span className="calendar-day-detail-selected-badge">선택한 일정</span>
                        )}
                      </div>
                      <span>{eventMeta(event)}</span>
                      {isAdmin && !event.recurring && (
                        <div className="calendar-day-detail-actions">
                          <button type="button" onClick={() => startDateEdit(event)}>날짜 일정 수정 시작</button>
                          <button type="button" className="is-danger" onClick={() => deleteDateSchedule(event)}>날짜 일정 삭제</button>
                        </div>
                      )}
                      {isAdmin && event.recurring && (
                        <div className="calendar-day-detail-actions">
                          {!event.canceled && (
                            <button type="button" onClick={() => cancelRecurringOccurrence(event)} disabled={exceptionSaving}>이번 일정 취소</button>
                          )}
                          <button type="button" onClick={() => startExceptionEdit(event)} disabled={exceptionSaving}>시간 변경</button>
                          {(event.exceptionId || event.canceled) && (
                            <button type="button" className="is-danger" onClick={() => clearRecurringException(event)} disabled={exceptionSaving}>예외 해제</button>
                          )}
                        </div>
                      )}
                      {exceptionEditor?.eventId === event.id && (
                        <div className="calendar-exception-editor">
                          <label>
                            <span>예외 시작 시간</span>
                            <input
                              type="time"
                              value={exceptionEditor.startTime}
                              onChange={(changeEvent) => setExceptionEditor((prev) => ({ ...prev, startTime: changeEvent.target.value }))}
                            />
                          </label>
                          <label>
                            <span>예외 종료 시간</span>
                            <input
                              type="time"
                              value={exceptionEditor.endTime}
                              onChange={(changeEvent) => setExceptionEditor((prev) => ({ ...prev, endTime: changeEvent.target.value }))}
                            />
                          </label>
                          <button type="button" onClick={() => saveExceptionEdit(event)} disabled={exceptionSaving}>
                            시간 변경 저장
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {(calendarNotice || calendarActionError) && (
                <p className={`calendar-day-detail-message ${calendarActionError ? 'is-error' : ''}`}>
                  {calendarActionError || calendarNotice}
                </p>
              )}
            </div>
          )}
          {(authLoading || loading) && (
            <div className="calendar-empty-state">
              동아리 일정을 불러오는 중입니다.
            </div>
          )}
          {isLocked && (
            <div className="calendar-empty-state">
              <strong>회원 전용 일정</strong>
              <span>회원 로그인 후 월별 동아리 일정을 확인할 수 있습니다.</span>
              <button type="button" onClick={() => navigate('/login')} className="apple-action-primary ml-2 inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs">
                로그인
              </button>
            </div>
          )}
          {!isLocked && !loading && error && (
            <div className="calendar-empty-state">
              {error}
            </div>
          )}
          {!isLocked && !loading && !error && !hasAnyEvent && (
            <div className="calendar-empty-state">
              등록된 일정이 없습니다. 실제 정기 회의, 세미나, 스터디, 프로젝트 발표, 모집 마감, MT/행사 일정이 추가되면 캘린더에 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default ClubCalendarSection
