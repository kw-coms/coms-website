import { DEFAULT_SCHEDULE_COLOR } from '../../shared/homeUi'

export const EMPTY_CALENDAR_SCHEDULE_FORM = {
  mode: 'date',
  title: '',
  startDate: '',
  endDate: '',
  daysOfWeek: [],
  startTime: '',
  endTime: '',
  colorHex: DEFAULT_SCHEDULE_COLOR,
}

export function calendarFormFromDateSchedule(schedule) {
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
