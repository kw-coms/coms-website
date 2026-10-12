import { request, requestNoContent } from './apiClient'

// Attendance ("출석 체크"). Members only; opening, closing, deleting and seeing who attended
// (one check, or the summary across checks) need the right to write club activities.

export type AttendanceSession = {
  id: number
  title: string
  openedByName: string
  openedAt: string
  closesAt: string
  open: boolean
  /** Counted on the server when the answer was made; 0 once the check is over. */
  remainingSeconds: number
  attendeeCount: number
  attended: boolean
  /** Only sent to those who may run attendance, and only while the session is open. */
  code?: string | null
}

export type AttendanceDetail = {
  session: AttendanceSession
  attendees: { name: string; checkedAt: string }[]
}

export type AttendanceCheckIn = { sessionId: number; title: string; checkedAt: string; alreadyChecked: boolean }

/** The recent checks, newest first, and one row per member who came to at least one. */
export type AttendanceSummary = {
  sessions: { id: number; title: string; openedAt: string; attendeeCount: number }[]
  members: { name: string; count: number; sessionIds: number[] }[]
}

export async function listAttendanceSessions(): Promise<AttendanceSession[]> {
  const data = await request('/api/attendance/sessions')
  return Array.isArray(data) ? data : []
}

export async function openAttendanceSession(payload: { title: string; minutes: number }): Promise<AttendanceSession> {
  return request('/api/attendance/sessions', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getAttendanceSession(id: number): Promise<AttendanceDetail> {
  return request(`/api/attendance/sessions/${id}`)
}

export async function getAttendanceSummary(): Promise<AttendanceSummary> {
  const data = await request('/api/attendance/summary')
  return {
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
    members: Array.isArray(data?.members) ? data.members : [],
  }
}

export async function closeAttendanceSession(id: number): Promise<AttendanceSession> {
  return request(`/api/attendance/sessions/${id}/close`, { method: 'POST' })
}

export async function deleteAttendanceSession(id: number): Promise<void> {
  await requestNoContent(`/api/attendance/sessions/${id}`, { method: 'DELETE' })
}

export async function checkInToAttendance(code: string): Promise<AttendanceCheckIn> {
  return request('/api/attendance/check-in', { method: 'POST', body: JSON.stringify({ code }) })
}
