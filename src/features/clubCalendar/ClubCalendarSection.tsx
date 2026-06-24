import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Download, Repeat, Trash2, X } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import {
  createClubActivity,
  createRecurringSchedule,
  deleteClubActivity,
  deleteRecurringSchedule,
  deleteRecurringScheduleException,
  listRecurringSchedules,
  updateClubActivity,
  updateRecurringSchedule,
  upsertRecurringScheduleException,
} from '../../services/clubActivityApi'
import { buildCalendarDayEvents, buildMonthEventSummary, visibleDayEvents } from '../../utils/monthlyCalendar'
import { parseScheduleCsv } from '../../utils/scheduleCsv'
import { buildIcsCalendar } from '../../utils/icsExport'
import { showToast } from '../../components/common/Toast'
import { calendarWeekdays, calendarMonthOptions } from '../../data/homeContent'
import {
  DEFAULT_SCHEDULE_COLOR,
  RECURRING_SCHEDULES_QUERY_KEY,
  SCHEDULE_COLOR_OPTIONS,
  SCHEDULE_OCCURRENCES_QUERY_KEY,
  WEEKDAY_OPTIONS,
  WEEKDAY_SHORT,
  buildCalendarMonth,
  formatActivityDate,
  parseLocalDate,
  useClubActivities,
  useScheduleOccurrences,
} from '../../shared/homeUi'

const EMPTY_CALENDAR_SCHEDULE_FORM = {
  mode: 'date',
  title: '',
  startDate: '',
  endDate: '',
  daysOfWeek: [],
  startTime: '',
  endTime: '',
  colorHex: DEFAULT_SCHEDULE_COLOR,
}

function calendarFormFromDateSchedule(schedule) {
  if (!schedule) {
    return { ...EMPTY_CALENDAR_SCHEDULE_FORM, daysOfWeek: [] }
  }
  return {
    mode: 'date',
    title: schedule.title || '',
    startDate: schedule.eventDate || schedule.startDate || '',
    endDate: schedule.endDate || schedule.eventDate || schedule.startDate || '',
    daysOfWeek: [],
    startTime: schedule.startTime || '',
    endTime: schedule.endTime || '',
    colorHex: schedule.colorHex || DEFAULT_SCHEDULE_COLOR,
  }
}

function CalendarScheduleComposer({ onDateCreated, onDateUpdated, editingDateSchedule, onDateEditDone }: any) {
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuth()
  const [form, setForm] = useState(() => calendarFormFromDateSchedule(editingDateSchedule))
  const [editingRecurringId, setEditingRecurringId] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvNotice, setCsvNotice] = useState('')
  const [csvError, setCsvError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(editingDateSchedule ? '선택한 날짜 일정을 수정 중입니다.' : '')
  const [error, setError] = useState('')

  const listQuery = useQuery({
    queryKey: RECURRING_SCHEDULES_QUERY_KEY,
    queryFn: async () => {
      const data = await listRecurringSchedules()
      return Array.isArray(data) ? data : []
    },
    enabled: Boolean(user) && !authLoading,
  })
  const schedules = listQuery.data ?? []

  const setMode = (mode) => {
    setForm((prev) => ({ ...prev, mode }))
    setEditingRecurringId(null)
    if (editingDateSchedule) onDateEditDone?.()
    setNotice('')
    setError('')
  }

  const toggleDay = (value) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(value)
        ? prev.daysOfWeek.filter((d) => d !== value)
        : [...prev.daysOfWeek, value],
    }))
  }

  const resetForm = () => {
    setForm(EMPTY_CALENDAR_SCHEDULE_FORM)
    setEditingRecurringId(null)
    onDateEditDone?.()
    setNotice('')
    setError('')
  }

  const resetAfterSave = () => {
    setForm((prev) => ({
      ...EMPTY_CALENDAR_SCHEDULE_FORM,
      mode: prev.mode,
      daysOfWeek: prev.mode === 'recurring' ? prev.daysOfWeek : [],
      startTime: prev.startTime,
      endTime: prev.endTime,
      colorHex: prev.colorHex || DEFAULT_SCHEDULE_COLOR,
    }))
    setEditingRecurringId(null)
    onDateEditDone?.()
  }

  const startEdit = (schedule) => {
    setEditingRecurringId(schedule.id)
    setForm({
      mode: 'recurring',
      title: schedule.title || '',
      startDate: schedule.startDate || '',
      endDate: schedule.endDate || '',
      daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [],
      startTime: schedule.startTime || '',
      endTime: schedule.endTime || '',
      colorHex: schedule.colorHex || DEFAULT_SCHEDULE_COLOR,
    })
    setNotice('')
    setError('')
  }

  const refreshCalendar = () => {
    queryClient.invalidateQueries({ queryKey: RECURRING_SCHEDULES_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: SCHEDULE_OCCURRENCES_QUERY_KEY })
  }

  const submit = async (event) => {
    event.preventDefault()
    const title = form.title.trim()
    const endDate = form.endDate || form.startDate
    if (!title || !form.startDate) {
      setError('일정 제목과 시작일을 입력하세요.')
      return
    }
    if (endDate < form.startDate) {
      setError('종료일은 시작일과 같거나 이후여야 합니다.')
      return
    }
    if (form.startTime && form.endTime && form.endTime < form.startTime) {
      setError('종료 시간은 시작 시간 이후여야 합니다.')
      return
    }
    if (form.mode === 'recurring' && form.daysOfWeek.length === 0) {
      setError('정기 모임은 반복 요일을 하나 이상 선택하세요.')
      return
    }
    setSaving(true)
    setNotice('')
    setError('')
    try {
      if (form.mode === 'date') {
        const payload = {
          kind: 'SCHEDULE',
          category: editingDateSchedule?.category || 'GENERAL',
          title,
          eventDate: form.startDate,
          endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          colorHex: form.colorHex,
          description: editingDateSchedule?.description || '',
        }
        if (editingDateSchedule?.id) {
          const updated = await updateClubActivity(editingDateSchedule.id, payload)
          onDateUpdated?.(updated)
          setNotice('날짜 일정을 수정했습니다.')
        } else {
          const created = await createClubActivity(payload)
          onDateCreated?.(created)
          setNotice('날짜 일정을 추가했습니다.')
        }
      } else {
        const payload = {
          title,
          description: null,
          startDate: form.startDate,
          endDate,
          daysOfWeek: form.daysOfWeek,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          colorHex: form.colorHex,
          location: null,
          category: null,
        }
        if (editingRecurringId) {
          await updateRecurringSchedule(editingRecurringId, payload)
          setNotice('정기 모임을 수정했습니다.')
        } else {
          await createRecurringSchedule(payload)
          setNotice('정기 모임을 추가했습니다.')
        }
        refreshCalendar()
      }
      resetAfterSave()
    } catch (err) {
      setError(err.message || '일정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvText(await file.text())
    setCsvNotice(`${file.name} 내용을 불러왔습니다.`)
    setCsvError('')
  }

  const importCsv = async () => {
    const parsed = parseScheduleCsv(csvText)
    if (parsed.errors.length > 0) {
      setCsvNotice('')
      setCsvError(parsed.errors.map((entry) => `${entry.line}행: ${entry.message}`).join(' '))
      return
    }
    if (parsed.rows.length === 0) {
      setCsvNotice('')
      setCsvError('가져올 일정이 없습니다.')
      return
    }
    setCsvImporting(true)
    setCsvNotice('')
    setCsvError('')
    try {
      let importedCount = 0
      for (const row of parsed.rows) {
        if (row.type === 'date') {
          const created = await createClubActivity({
            kind: 'SCHEDULE',
            category: 'GENERAL',
            title: row.title,
            eventDate: row.startDate,
            endDate: row.endDate || row.startDate,
            startTime: row.startTime,
            endTime: row.endTime,
            colorHex: row.colorHex,
          })
          onDateCreated?.(created)
        } else {
          await createRecurringSchedule({
            title: row.title,
            description: null,
            startDate: row.startDate,
            endDate: row.endDate,
            daysOfWeek: row.daysOfWeek,
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            colorHex: row.colorHex,
            location: null,
            category: null,
          })
        }
        importedCount += 1
      }
      refreshCalendar()
      setCsvNotice(`CSV에서 일정 ${importedCount}개를 가져왔습니다.`)
    } catch (err) {
      setCsvError(err.message || 'CSV 일정을 가져오지 못했습니다.')
    } finally {
      setCsvImporting(false)
    }
  }

  const remove = async (schedule) => {
    if (typeof window !== 'undefined' && !window.confirm(`'${schedule.title}' 정기 모임을 삭제할까요?`)) return
    setError('')
    setNotice('')
    try {
      await deleteRecurringSchedule(schedule.id)
      if (editingRecurringId === schedule.id) resetForm()
      setNotice('정기 모임을 삭제했습니다.')
      refreshCalendar()
    } catch (err) {
      setError(err.message || '정기 모임을 삭제하지 못했습니다.')
    }
  }

  return (
    <div className="recurring-schedule-manager mt-6">
      <form onSubmit={submit} className="calendar-admin-composer calendar-admin-composer-unified" aria-label="캘린더 일정 관리">
        <div className="calendar-admin-composer-heading">
          <p className="calendar-admin-composer-title">
            {editingDateSchedule ? '날짜 일정 수정' : (editingRecurringId ? '정기 모임 수정' : '관리자 일정 추가')}
          </p>
          <p className="calendar-admin-composer-copy">처음에 날짜 일정인지 정기 모임인지 선택하고, 제목·기간·시간만 입력합니다.</p>
        </div>
        <div className="calendar-admin-mode-tabs" role="radiogroup" aria-label="일정 종류 선택">
          <button
            type="button"
            className={form.mode === 'date' ? 'is-active' : ''}
            onClick={() => setMode('date')}
            aria-pressed={form.mode === 'date'}
            aria-label="날짜 일정"
            disabled={saving}
          >
            <span className="calendar-admin-mode-tab-main" aria-hidden="true">
              <span className="calendar-admin-mode-tab-label">날짜 일정</span>
              <span className="calendar-admin-mode-tab-copy">하루 또는 기간 일정</span>
            </span>
            {form.mode === 'date' && <span className="calendar-admin-mode-badge" aria-hidden="true">선택 중</span>}
          </button>
          <button
            type="button"
            className={form.mode === 'recurring' ? 'is-active' : ''}
            onClick={() => setMode('recurring')}
            aria-pressed={form.mode === 'recurring'}
            aria-label="정기 모임"
            disabled={saving || Boolean(editingDateSchedule)}
          >
            <span className="calendar-admin-mode-tab-main" aria-hidden="true">
              <span className="calendar-admin-mode-tab-label">정기 모임</span>
              <span className="calendar-admin-mode-tab-copy">매주 반복되는 일정</span>
            </span>
            {form.mode === 'recurring' && <span className="calendar-admin-mode-badge" aria-hidden="true">선택 중</span>}
          </button>
        </div>
        <label>
          <span>일정 제목</span>
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            maxLength={120}
          />
        </label>
        <label>
          <span>시작일</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
          />
        </label>
        <label>
          <span>{form.mode === 'date' ? '종료일 (선택)' : '종료일'}</span>
          <input
            type="date"
            value={form.endDate}
            onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
          />
        </label>
        {form.mode === 'recurring' && (
          <div className="calendar-admin-composer-wide recurring-weekday-picker" role="group" aria-labelledby="recurring-weekday-label">
            <span id="recurring-weekday-label" className="recurring-weekday-label">반복 요일</span>
            <div className="recurring-weekday-options">
              {WEEKDAY_OPTIONS.map((weekday) => (
                <label key={weekday.value} className={`recurring-weekday-option ${form.daysOfWeek.includes(weekday.value) ? 'is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.daysOfWeek.includes(weekday.value)}
                    onChange={() => toggleDay(weekday.value)}
                  />
                  <span>{weekday.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label>
          <span>시작 시간 (선택)</span>
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
          />
        </label>
        <label>
          <span>종료 시간 (선택)</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
          />
        </label>
        <div className="calendar-color-picker">
          <span>일정 색상</span>
          <div className="calendar-color-swatches" aria-label="빠른 색상 선택">
            {SCHEDULE_COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={form.colorHex === color ? 'is-active' : ''}
                style={{ '--calendar-swatch-color': color } as any}
                onClick={() => setForm((prev) => ({ ...prev, colorHex: color }))}
                aria-label={`${color} 색상 선택`}
                aria-pressed={form.colorHex === color}
                disabled={saving}
              />
            ))}
          </div>
          <input
            aria-label="일정 색상"
            type="color"
            value={form.colorHex || DEFAULT_SCHEDULE_COLOR}
            onChange={(event) => setForm((prev) => ({ ...prev, colorHex: event.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="calendar-admin-composer-actions">
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.startDate || (form.mode === 'recurring' && (!form.endDate || form.daysOfWeek.length === 0))}
          >
            {saving ? '저장 중...' : (editingDateSchedule ? '날짜 일정 수정' : (editingRecurringId ? '정기 모임 수정' : (form.mode === 'date' ? '날짜 일정 추가' : '정기 모임 등록')))}
          </button>
          {(editingRecurringId || editingDateSchedule) && (
            <button type="button" className="recurring-cancel-edit" onClick={resetForm} disabled={saving}>
              취소
            </button>
          )}
        </div>
        {notice && <p className="calendar-admin-composer-notice">{notice}</p>}
        {error && <p className="calendar-admin-composer-notice" style={{ color: '#dc2626' }}>{error}</p>}
      </form>

      <div className="calendar-csv-import mt-4">
        <div>
          <p className="calendar-admin-composer-title">학기 일정 CSV 가져오기</p>
          <p className="calendar-admin-composer-copy">type,title,startDate,endDate,startTime,endTime,daysOfWeek 형식으로 날짜 일정과 정기 모임을 한 번에 등록합니다.</p>
        </div>
        <textarea
          aria-label="학기 일정 CSV"
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="종류,제목,시작일,종료일,시작시간,종료시간,요일"
        />
        <div className="calendar-csv-import-actions">
          <label>
            CSV 파일 선택
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
          </label>
          <button type="button" onClick={importCsv} disabled={csvImporting || !csvText.trim()}>
            {csvImporting ? '가져오는 중...' : 'CSV 일정 가져오기'}
          </button>
        </div>
        {csvNotice && <p className="calendar-admin-composer-notice">{csvNotice}</p>}
        {csvError && <p className="calendar-admin-composer-notice" style={{ color: '#dc2626' }}>{csvError}</p>}
      </div>

      {schedules.length > 0 && (
        <ul className="recurring-schedule-list mt-4">
          {schedules.map((schedule) => {
            const dayLabels = (schedule.daysOfWeek || []).map((d) => WEEKDAY_SHORT[d] || d).join('·')
            const timeLabel = schedule.startTime
              ? (schedule.endTime ? `${schedule.startTime}~${schedule.endTime}` : schedule.startTime)
              : ''
            return (
              <li key={schedule.id} className={`recurring-schedule-item ${editingRecurringId === schedule.id ? 'recurring-schedule-item-selected' : ''}`}>
                <div className="recurring-schedule-item-main">
                  <span className="recurring-schedule-item-title">
                    <Repeat size={13} aria-hidden="true" /> {schedule.title}
                    {editingRecurringId === schedule.id && <span className="recurring-schedule-item-badge">수정 중</span>}
                  </span>
                  <span className="recurring-schedule-item-meta">
                    {formatActivityDate(schedule.startDate)} ~ {formatActivityDate(schedule.endDate)}
                    {dayLabels && ` · ${dayLabels}요일`}
                    {timeLabel && ` · ${timeLabel}`}
                  </span>
                </div>
                <div className="recurring-schedule-item-actions">
                  <button type="button" onClick={() => startEdit(schedule)}>수정</button>
                  <button type="button" className="recurring-schedule-delete" onClick={() => remove(schedule)} aria-label="삭제">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ClubCalendarSection({ compact = false }: any) {
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
  const hasAnyEvent = Object.values(eventsByDay).some((list: any) => list.length > 0)
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
    if (typeof window !== 'undefined' && !window.confirm(`'${event.title}' 날짜 일정을 삭제할까요?`)) return
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
      .flatMap((dayEvents: any) => (Array.isArray(dayEvents) ? dayEvents : []))
      .filter((event: any) => !event.canceled && !(event.range && !event.showTitle))

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
          <div className="calendar-month-summary mt-6">
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
                        style={event.colorHex ? { '--calendar-event-color': event.colorHex } as any : undefined}
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
                    style={event.colorHex ? { '--calendar-event-color': event.colorHex } as any : undefined}
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
