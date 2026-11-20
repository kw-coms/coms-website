import { request, requestNoContent } from './apiClient'

export type TeamProjectSummary = { id: number; title: string; description: string; open: boolean; myTeamId: number | null; myTeamName: string | null }
export type Milestone = { id: number; title: string; description: string; startsAt: string | null; dueAt: string | null; submittable: boolean; position: number }
export type MilestoneWrite = { title: string; description: string; startsAt: string | null; dueAt: string | null; submittable: boolean }
export type TeamMember = { studentId: string | null; name: string; generation: string | null }
export type Team = { id: number; name: string; topic: string; intro: string; members: TeamMember[] }
export type TeamWrite = { name: string; topic: string; intro: string }
export type TeamProjectDetail = {
  id: number; title: string; description: string; open: boolean
  milestones: Milestone[]; teams: Team[]; myTeamId: number | null
}
export type SubmissionFile = { id: number; originalName: string; mimeType: string; fileSize: number; downloadUrl: string }
export type Submission = {
  id: number; teamId: number; milestoneId: number; body: string; links: string[]; files: SubmissionFile[]
  submittedByName: string; submittedAt: string; updatedByName: string; updatedAt: string
  late: boolean; editedAfterDue: boolean
}
export type SubmissionDraft = { body: string; links: string[]; newFiles: File[]; removeFileIds: number[] }
export type BoardStatus = 'SUBMITTED' | 'LATE' | 'MISSING'
export type BoardCell = { milestoneId: number; status: BoardStatus; submittedAt: string | null; updatedAt: string | null }
export type BoardTeam = { id: number; name: string; topic: string; memberCount: number; cells: BoardCell[] }
export type Board = { milestones: Milestone[]; teams: BoardTeam[] }

const adminPath = (id: number) => `/api/admin/team-projects/${id}`
const submissionPath = (id: number, teamId: number, milestoneId: number) =>
  `/api/team-projects/${id}/teams/${teamId}/milestones/${milestoneId}/submission`
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const listTeamProjects = (): Promise<TeamProjectSummary[]> => request('/api/team-projects')
export const getTeamProject = (id: number): Promise<TeamProjectDetail> => request(`/api/team-projects/${id}`)
export const listTeamSubmissions = (id: number, teamId: number): Promise<Submission[]> =>
  request(`/api/team-projects/${id}/teams/${teamId}/submissions`)
export function saveSubmission(id: number, teamId: number, milestoneId: number, draft: SubmissionDraft): Promise<Submission> {
  const body = new FormData()
  body.append('body', draft.body)
  draft.links.forEach(link => body.append('links', link))
  draft.newFiles.forEach(file => body.append('files', file))
  draft.removeFileIds.forEach(fileId => body.append('removeFileIds', String(fileId)))
  return request(submissionPath(id, teamId, milestoneId), { method: 'PUT', body })
}
export const deleteSubmission = (id: number, teamId: number, milestoneId: number): Promise<void> =>
  requestNoContent(submissionPath(id, teamId, milestoneId), { method: 'DELETE' })

export const createTeamProject = (payload: { title: string; description: string; open: boolean }): Promise<TeamProjectSummary> =>
  request('/api/admin/team-projects', json('POST', payload))
export const updateTeamProject = (id: number, payload: { title: string; description: string; open: boolean }): Promise<TeamProjectSummary> =>
  request(adminPath(id), json('PUT', payload))
export const deleteTeamProject = (id: number): Promise<void> => requestNoContent(adminPath(id), { method: 'DELETE' })
export const getTeamProjectBoard = (id: number): Promise<Board> => request(`${adminPath(id)}/board`)
export const createMilestone = (id: number, payload: MilestoneWrite): Promise<Milestone> =>
  request(`${adminPath(id)}/milestones`, json('POST', payload))
export const updateMilestone = (id: number, milestoneId: number, payload: MilestoneWrite): Promise<Milestone> =>
  request(`${adminPath(id)}/milestones/${milestoneId}`, json('PUT', payload))
export const deleteMilestone = (id: number, milestoneId: number): Promise<void> =>
  requestNoContent(`${adminPath(id)}/milestones/${milestoneId}`, { method: 'DELETE' })
export const reorderMilestones = (id: number, ids: number[]): Promise<Milestone[]> =>
  request(`${adminPath(id)}/milestones/order`, json('PUT', { ids }))
export const createTeam = (id: number, payload: TeamWrite): Promise<Team> => request(`${adminPath(id)}/teams`, json('POST', payload))
export const updateTeam = (id: number, teamId: number, payload: TeamWrite): Promise<Team> =>
  request(`${adminPath(id)}/teams/${teamId}`, json('PUT', payload))
export const deleteTeam = (id: number, teamId: number): Promise<void> =>
  requestNoContent(`${adminPath(id)}/teams/${teamId}`, { method: 'DELETE' })
export const addTeamMember = (id: number, teamId: number, studentId: string): Promise<TeamMember> =>
  request(`${adminPath(id)}/teams/${teamId}/members`, json('POST', { studentId }))
export const removeTeamMember = (id: number, teamId: number, studentId: string): Promise<void> =>
  requestNoContent(`${adminPath(id)}/teams/${teamId}/members/${encodeURIComponent(studentId)}`, { method: 'DELETE' })
