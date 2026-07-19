import { useState } from 'react'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Repeat, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import {
  createClubActivity,
  createRecurringSchedule,
  deleteRecurringSchedule,
  listRecurringSchedules,
  updateClubActivity,
  updateRecurringSchedule,
} from '../../services/clubActivityApi'
import { parseScheduleCsv } from '../../utils/scheduleCsv'
import {
  DEFAULT_SCHEDULE_COLOR,
  RECURRING_SCHEDULES_QUERY_KEY,
  SCHEDULE_COLOR_OPTIONS,
  SCHEDULE_OCCURRENCES_QUERY_KEY,
  WEEKDAY_OPTIONS,
  WEEKDAY_SHORT,
  formatActivityDate,
} from '../../shared/homeUi'
import { EMPTY_CALENDAR_SCHEDULE_FORM, calendarFormFromDateSchedule } from './calendarScheduleForm'

export function CalendarScheduleComposer({ onDateCreated, onDateUpdated, editingDateSchedule, onDateEditDone }: {
  onDateCreated?: (created: unknown) => void
  onDateUpdated?: (updated: unknown) => void
  editingDateSchedule?: { id?: string | number; category?: string; description?: string; [key: string]: unknown } | null
  onDateEditDone?: () => void
}) {
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
    if (!(await confirmDialog({ message: `'${schedule.title}' 정기 모임을 삭제할까요?`, tone: 'danger' }))) return
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
                style={{ '--calendar-swatch-color': color } as React.CSSProperties}
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
