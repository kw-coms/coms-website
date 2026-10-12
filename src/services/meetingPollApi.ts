import { request, requestNoContent } from './apiClient'
import type { MeetingPollDetail, MeetingPollSummary } from '../utils/meetingPoll'

// Meeting polls ("일정 조율"). Members only.

export async function listMeetingPolls(): Promise<MeetingPollSummary[]> {
  const data = await request('/api/meeting-polls')
  return Array.isArray(data) ? data : []
}

export async function getMeetingPoll(id: number | string): Promise<MeetingPollDetail> {
  return request(`/api/meeting-polls/${id}`)
}

export async function createMeetingPoll(payload: {
  title: string
  description: string
  dates: string[]
  startMinute: number
  endMinute: number
}): Promise<MeetingPollDetail> {
  return request('/api/meeting-polls', { method: 'POST', body: JSON.stringify(payload) })
}

export async function saveMeetingPollAvailability(id: number | string, slots: string): Promise<MeetingPollDetail> {
  return request(`/api/meeting-polls/${id}/availability`, { method: 'PUT', body: JSON.stringify({ slots }) })
}

export async function clearMeetingPollAvailability(id: number | string): Promise<MeetingPollDetail> {
  return request(`/api/meeting-polls/${id}/availability`, { method: 'DELETE' })
}

export async function deleteMeetingPoll(id: number | string): Promise<void> {
  await requestNoContent(`/api/meeting-polls/${id}`, { method: 'DELETE' })
}
