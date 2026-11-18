import { request, requestNoContent } from './apiClient'

export type Scores = { themeFit: number; creativity: number; technology: number; completeness: number; practicality: number }
export type AlumniIdentity = { generation: number; name: string }
export type HackathonReview = Scores & {
  id: number; projectId: string; generation: number | null; name: string; feedback: string; chair: boolean; createdAt: string
}
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
