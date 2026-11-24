import { request, requestBlob, requestNoContent } from './apiClient'

export type GroupStatus = 'PROPOSED' | 'RECRUITING' | 'ACTIVE' | 'ENDED'
export type GroupCard = { id: number; name: string; topicTags: string[]; schedule: string | null; leaderName: string | null; status: GroupStatus; interestCount?: number | null }
export type GroupWrite = { name: string; description: string; topicTags: string[]; term: string; schedule: string; place: string; capacity: number | null; leaderStudentId?: string }
export type Interest = { level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null; slots: string[] }
export type InterestSummary = { total: number; levels: Record<string, number>; slots: Record<string, number>; names: { studentId: string; name: string }[] | null }
export type Membership = { studentId: string; name: string; role: 'LEADER' | 'MEMBER'; status: 'PENDING' | 'APPROVED'; joinedAt: string }
export type GroupView = GroupCard & { description: string | null; leaderStudentId: string; term: string; place: string | null; capacity: number | null; createdBy: string; createdAt: string; updatedAt: string; myMembership?: Membership | null; myInterest?: Interest | null; manager: boolean; interestSummary: InterestSummary }
export type StudySession = { id: number; groupId: number; roundNo: number; date: string; topic: string; notes: string | null; attendanceSessionId: number | null; attendanceOpen: boolean; attendanceCode: string | null }
export type SessionWrite = { date: string; topic: string; notes: string }
export type RosterRow = { studentId: string; name: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | null; source: 'CODE' | 'MANUAL' | null; checkedAt: string | null; approvedMember: boolean }
export type RateRow = { studentId: string; name: string; attended: number; eligible: number; rate: number }
export type Material = { id: number; title: string; description: string | null; studyGroupId: number | null; studySessionId: number | null; createdAt?: string; uploadedAt?: string; originalName?: string }

const base = '/api/study-groups'
const groupPath = (id: number) => `${base}/${id}`
const sessionPath = (groupId: number, id: number) => `${groupPath(groupId)}/sessions/${id}`
export const listStudyGroups = (sort = ''): Promise<GroupCard[]> => request(base + (sort ? `?sort=${sort}` : ''))
export const getStudyGroup = (id: number): Promise<GroupView> => request(groupPath(id))
export const createStudyGroup = (data: GroupWrite, direct = false): Promise<GroupView> => request(base + (direct ? '?direct=true' : ''), { method: 'POST', body: JSON.stringify(data) })
export const updateStudyGroup = (id: number, data: GroupWrite): Promise<GroupView> => request(groupPath(id), { method: 'PUT', body: JSON.stringify(data) })
export const approveStudyGroup = (id: number): Promise<GroupView> => request(`${groupPath(id)}/approve`, { method: 'POST' })
export const startStudyGroup = (id: number): Promise<GroupView> => request(`${groupPath(id)}/start`, { method: 'POST' })
export const endStudyGroup = (id: number): Promise<GroupView> => request(`${groupPath(id)}/end`, { method: 'POST' })
export const replaceStudyLeader = (id: number, studentId: string): Promise<GroupView> => request(`${groupPath(id)}/leader`, { method: 'PUT', body: JSON.stringify({ studentId }) })
export const joinStudyGroup = (id: number): Promise<Membership> => request(`${groupPath(id)}/join`, { method: 'POST' })
export const leaveStudyGroup = (id: number): Promise<void> => requestNoContent(`${groupPath(id)}/members/me`, { method: 'DELETE' })
export const listStudyMembers = (id: number): Promise<Membership[]> => request(`${groupPath(id)}/members`)
export const decideStudyMember = (id: number, studentId: string, approved: boolean): Promise<void> => request(`${groupPath(id)}/members/${encodeURIComponent(studentId)}`, { method: 'PUT', body: JSON.stringify({ approved }) })
export const removeStudyMember = (id: number, studentId: string): Promise<void> => requestNoContent(`${groupPath(id)}/members/${encodeURIComponent(studentId)}`, { method: 'DELETE' })
export const saveStudyInterest = (id: number, interest: Interest): Promise<Interest> => request(`${groupPath(id)}/interest`, { method: 'PUT', body: JSON.stringify(interest) })
export const removeStudyInterest = (id: number): Promise<void> => requestNoContent(`${groupPath(id)}/interest`, { method: 'DELETE' })
export const listStudySessions = (id: number): Promise<StudySession[]> => request(`${groupPath(id)}/sessions`)
export const createStudySession = (groupId: number, data: SessionWrite): Promise<StudySession> => request(`${groupPath(groupId)}/sessions`, { method: 'POST', body: JSON.stringify(data) })
export const updateStudySession = (groupId: number, id: number, data: SessionWrite): Promise<StudySession> => request(sessionPath(groupId, id), { method: 'PUT', body: JSON.stringify(data) })
export const openStudyAttendance = (groupId: number, id: number, minutes: number): Promise<StudySession> => request(`${sessionPath(groupId, id)}/attendance/open`, { method: 'POST', body: JSON.stringify({ minutes }) })
export const closeStudyAttendance = (groupId: number, id: number): Promise<StudySession> => request(`${sessionPath(groupId, id)}/attendance/close`, { method: 'POST' })
export const getStudyRoster = async (groupId: number, id: number): Promise<RosterRow[]> => (await request(`${sessionPath(groupId, id)}/attendance/roster`)).members
export const markStudyAttendance = (groupId: number, id: number, studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE'): Promise<{ members: RosterRow[] }> => request(`${sessionPath(groupId, id)}/attendance/members/${encodeURIComponent(studentId)}`, { method: 'PUT', body: JSON.stringify({ status }) })
export const getStudyRates = (id: number): Promise<RateRow[]> => request(`${groupPath(id)}/attendance/rates`)
export const downloadStudyRates = (id: number): Promise<Blob> => requestBlob(`${groupPath(id)}/attendance/rates.csv`)
export const listStudyMaterials = (groupId: number, sessionId?: number): Promise<Material[]> => request(`/api/files?studyGroupId=${groupId}${sessionId ? `&studySessionId=${sessionId}` : ''}`)
export const uploadStudyMaterial = (groupId: number, data: { title: string; description: string; file: File; sessionId?: number }): Promise<Material> => {
  const body = new FormData()
  body.append('title', data.title)
  body.append('description', data.description)
  body.append('category', 'GENERAL')
  body.append('file', data.file)
  body.append('studyGroupId', String(groupId))
  if (data.sessionId) body.append('studySessionId', String(data.sessionId))
  return request('/api/files', { method: 'POST', body })
}
