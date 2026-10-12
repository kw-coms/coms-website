import { request, requestNoContent } from './apiClient'
import type { Gathering, GatheringDetail } from '../utils/gathering'

// Gatherings ("모임 신청"). Members only. Closing or deleting one and taking someone else's
// name off it are for the member who opened it and the president; the server decides.

export type GatheringDraft = {
  title: string
  description: string
  capacity: number | null
  noteLabel: string
  closesAt: string | null
}

export async function listGatherings(): Promise<Gathering[]> {
  const data = await request('/api/gatherings')
  return Array.isArray(data) ? data : []
}

export async function getGathering(id: number | string): Promise<GatheringDetail> {
  return request(`/api/gatherings/${id}`)
}

export async function createGathering(payload: GatheringDraft): Promise<GatheringDetail> {
  return request('/api/gatherings', { method: 'POST', body: JSON.stringify(payload) })
}

/** Signs up, or replaces what was written when already signed up. */
export async function joinGathering(id: number | string, note: string): Promise<GatheringDetail> {
  return request(`/api/gatherings/${id}/signups`, { method: 'POST', body: JSON.stringify({ note }) })
}

export async function leaveGathering(id: number | string): Promise<GatheringDetail> {
  return request(`/api/gatherings/${id}/signups/me`, { method: 'DELETE' })
}

export async function removeGatheringSignup(id: number | string, signupId: number): Promise<GatheringDetail> {
  return request(`/api/gatherings/${id}/signups/${signupId}`, { method: 'DELETE' })
}

export async function closeGathering(id: number | string): Promise<GatheringDetail> {
  return request(`/api/gatherings/${id}/close`, { method: 'POST' })
}

export async function deleteGathering(id: number | string): Promise<void> {
  await requestNoContent(`/api/gatherings/${id}`, { method: 'DELETE' })
}
