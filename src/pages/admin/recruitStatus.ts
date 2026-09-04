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

// 지원 처리 이력(RecruitPromotionLog)의 decision → 칩 라벨/스타일.
// 합격은 기존 accent 톤(category)을, 불합격은 rose(admin) 톤을 쓴다.
export function recruitDecisionLabel(decision) {
  return decision === 'REJECTED' ? '불합격' : '합격'
}

export function recruitDecisionChipVariant(decision) {
  return decision === 'REJECTED' ? 'admin' : 'category'
}
