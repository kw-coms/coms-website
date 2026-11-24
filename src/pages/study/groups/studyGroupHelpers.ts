import type { GroupCard, GroupStatus, RateRow } from '../../../services/studyGroupApi'

export const GROUPS_KEY = ['study-groups']
export const statusLabel = (status: GroupStatus) => ({ PROPOSED: '제안', RECRUITING: '모집 중', ACTIVE: '진행 중', ENDED: '종료' })[status]
export const groupCounts = (groups: GroupCard[]) => groups.reduce((counts, group) => ({ ...counts, [group.status]: counts[group.status] + 1 }), { PROPOSED: 0, RECRUITING: 0, ACTIVE: 0, ENDED: 0 } as Record<GroupStatus, number>)
export const interestBars = (values: Record<string, number>, total: number) => Object.entries(values).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count, width: total ? Math.round(count / total * 100) : 0 }))
export const attendancePercent = (row: Pick<RateRow, 'attended' | 'eligible'>) => row.eligible ? Math.round(row.attended / row.eligible * 100) : 0
