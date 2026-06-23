export const RECRUIT_STATUS_OPTIONS = [
  { value: 'RECEIVED', label: '접수됨' },
  { value: 'REVIEWING', label: '검토중' },
  { value: 'ACCEPTED', label: '합격' },
  { value: 'HOLD', label: '보류' },
  { value: 'REJECTED', label: '불합격' },
]

const RECRUIT_PENDING_STATUSES = new Set(['RECEIVED', 'REVIEWING', 'HOLD'])

export function recruitStatusLabel(status) {
  return RECRUIT_STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '알 수 없음'
}

export function recruitPendingCount(applications) {
  return applications.filter((application) => RECRUIT_PENDING_STATUSES.has(application.status)).length
}
