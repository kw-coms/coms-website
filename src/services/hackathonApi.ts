import { request, requestNoContent } from './apiClient'

export type Scores = { themeFit: number; creativity: number; technology: number; completeness: number; practicality: number }
export type AlumniIdentity = { generation: number; name: string }
export type HackathonReview = Scores & {
  id: number; eventId?: number; projectId: string; generation: number | null; name: string; feedback: string; chair: boolean; createdAt: string
}
export type HackathonMaterial = { id: number; projectId: string | null; kind: 'proposal' | 'presentation' | 'video' | 'poster' | 'other'; label: string; originalName: string; mimeType: string; fileSize: number; url: string }
export type HackathonProject = { projectId: string; title: string; author: string; description: string; github: string | null; live: string | null; position: number; materials: HackathonMaterial[] }
export type HackathonStatus = 'UPCOMING' | 'IN_PROGRESS' | 'REVIEWING' | 'DONE'
export type HackathonEventBase = {
  id: number; title: string; year: number; semester: 1 | 2; open: boolean
  startsAt: string | null; endsAt: string | null; status: HackathonStatus; resultsPublished: boolean
}
export type HackathonEventSummary = HackathonEventBase & { theme: string; projectCount: number }
export type AdminHackathonEventSummary = HackathonEventBase & { published: boolean }
export type HackathonResult = {
  projectId: string; title: string; author: string; rank: number
  finalScore: number; alumniAverage: number; chairScore: number; alumniCount: number; criteria: Scores
}
export type HackathonEvent = HackathonEventBase & { theme: string; introduction: string; rules: string; projects: HackathonProject[]; materials: HackathonMaterial[]; results: HackathonResult[] }
export type AdminHackathonEvent = Omit<HackathonEvent, 'results'> & { published: boolean }
export type HackathonEventWrite = Pick<HackathonEvent, 'title' | 'year' | 'semester' | 'theme' | 'introduction' | 'rules' | 'startsAt' | 'endsAt'>
export type HackathonProjectWrite = Pick<HackathonProject, 'title' | 'author' | 'description' | 'github' | 'live'> & { position?: number }

const adminEventPath = (id: number) => `/api/admin/hackathon/events/${id}`
export const listHackathonEvents = (): Promise<HackathonEventSummary[]> => request('/api/hackathon/events')
export const getHackathonEvent = (id: number): Promise<HackathonEvent> => request(`/api/hackathon/events/${id}`)
export const submitEventReview = (id: number, payload: Scores & AlumniIdentity & { projectId: string; feedback: string }): Promise<{ projectId: string }> =>
  request(`/api/hackathon/events/${id}/reviews`, { method: 'POST', body: JSON.stringify(payload) })
export const listAdminHackathonEvents = (): Promise<AdminHackathonEventSummary[]> => request('/api/admin/hackathon/events')
export const getAdminHackathonEvent = (id: number): Promise<AdminHackathonEvent> => request(adminEventPath(id))
export const createHackathonEvent = (payload: HackathonEventWrite): Promise<AdminHackathonEvent> =>
  request('/api/admin/hackathon/events', { method: 'POST', body: JSON.stringify(payload) })
export const updateHackathonEvent = (id: number, payload: HackathonEventWrite): Promise<AdminHackathonEvent> =>
  request(adminEventPath(id), { method: 'PUT', body: JSON.stringify(payload) })
export const publishHackathonEvent = (id: number, published: boolean): Promise<{ published: boolean }> =>
  request(`${adminEventPath(id)}/published`, { method: 'PUT', body: JSON.stringify({ published }) })
export const setEventOpen = (id: number, open: boolean): Promise<{ open: boolean }> =>
  request(`${adminEventPath(id)}/settings`, { method: 'PUT', body: JSON.stringify({ open }) })
export const setEventResultsPublished = (id: number, resultsPublished: boolean): Promise<{ resultsPublished: boolean }> =>
  request(`${adminEventPath(id)}/results-published`, { method: 'PUT', body: JSON.stringify({ resultsPublished }) })
export const createHackathonProject = (id: number, payload: HackathonProjectWrite): Promise<HackathonProject> =>
  request(`${adminEventPath(id)}/projects`, { method: 'POST', body: JSON.stringify(payload) })
export const updateHackathonProject = (id: number, projectId: string, payload: HackathonProjectWrite): Promise<HackathonProject> =>
  request(`${adminEventPath(id)}/projects/${encodeURIComponent(projectId)}`, { method: 'PUT', body: JSON.stringify(payload) })
export const deleteHackathonProject = (id: number, projectId: string): Promise<void> =>
  requestNoContent(`${adminEventPath(id)}/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
export const uploadHackathonMaterial = (id: number, file: File, projectId: string | null, kind: HackathonMaterial['kind'], label: string): Promise<HackathonMaterial> => {
  const body = new FormData()
  body.append('file', file)
  if (projectId) body.append('projectId', projectId)
  body.append('kind', kind)
  body.append('label', label)
  return request(`${adminEventPath(id)}/materials`, { method: 'POST', body })
}
export const deleteHackathonMaterial = (id: number, materialId: number): Promise<void> =>
  requestNoContent(`${adminEventPath(id)}/materials/${materialId}`, { method: 'DELETE' })
export const listEventReviews = (id: number): Promise<HackathonReview[]> => request(`${adminEventPath(id)}/reviews`)
export const deleteEventReview = (id: number, reviewId: number): Promise<void> =>
  requestNoContent(`${adminEventPath(id)}/reviews/${reviewId}`, { method: 'DELETE' })
export const saveEventChairReview = (id: number, projectId: string, payload: Scores & { feedback: string }): Promise<HackathonReview> =>
  request(`${adminEventPath(id)}/chair-reviews/${encodeURIComponent(projectId)}`, { method: 'PUT', body: JSON.stringify(payload) })
export const getHackathon = (): Promise<{ open: boolean }> => request('/api/hackathon')
export const submitHackathonReview = (payload: Scores & AlumniIdentity & { projectId: string; feedback: string }): Promise<{ projectId: string }> =>
  request('/api/hackathon/reviews', { method: 'POST', body: JSON.stringify(payload) })
export const listHackathonReviews = (): Promise<HackathonReview[]> => request('/api/admin/hackathon/reviews')
export const deleteHackathonReview = (id: number): Promise<void> =>
  requestNoContent(`/api/admin/hackathon/reviews/${id}`, { method: 'DELETE' })
export const saveHackathonChairReview = (projectId: string, payload: Scores & { feedback: string }): Promise<HackathonReview> =>
  request(`/api/admin/hackathon/chair-reviews/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) })
export const setHackathonOpen = (open: boolean): Promise<{ open: boolean }> =>
  request('/api/admin/hackathon/settings', { method: 'PUT', body: JSON.stringify({ open }) })
