import { apiUrl, createApiError, renewSessionAfter401, request, requestNoContent, sessionGeneration, UPLOAD_TIMEOUT_MS } from './apiClient'

export type TeamProjectSummary = { id: number; title: string; description: string; open: boolean; allowLateSubmissions: boolean; myTeamId: number | null; myTeamName: string | null }
export type TeamProjectWrite = { title: string; description: string; open: boolean; allowLateSubmissions: boolean }
// Dates are Korea-time wall-clock strings ("2026-11-29T23:59:00"). allDay: only the date counts
// (start 00:00, due until 23:59:59 of that day).
export type Milestone = { id: number; title: string; description: string; startsAt: string | null; dueAt: string | null; allDay: boolean; submittable: boolean; position: number }
export type MilestoneWrite = { title: string; description: string; startsAt: string | null; dueAt: string | null; allDay: boolean; submittable: boolean }
export type TeamMember = { studentId: string | null; name: string; generation: string | null }
export type Team = { id: number; name: string; topic: string; intro: string; members: TeamMember[] }
export type TeamWrite = { name: string; topic: string; intro: string }
export type TeamProjectDetail = {
  id: number; title: string; description: string; open: boolean; allowLateSubmissions: boolean
  milestones: Milestone[]; teams: Team[]; myTeamId: number | null
  maxFileBytes: number; maxRequestBytes: number
}
export type SubmissionFile = { id: number; originalName: string; mimeType: string; fileSize: number; downloadUrl: string }
export type SubmissionTiming = 'AUTOMATIC' | 'ON_TIME' | 'LATE'
export type Submission = {
  id: number; teamId: number; milestoneId: number; body: string; links: string[]; files: SubmissionFile[]
  submittedByName: string; submittedAt: string; updatedByName: string; updatedAt: string
  late: boolean; editedAfterDue: boolean; timing: SubmissionTiming
}
export type SubmissionDraft = { body: string; links: string[]; newFiles: File[]; removeFileIds: number[] }
export type BoardStatus = 'SUBMITTED' | 'LATE' | 'MISSING'
export type BoardCell = { milestoneId: number; status: BoardStatus; submittedAt: string | null; updatedAt: string | null; editedAfterDue: boolean; timing: SubmissionTiming | null }
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
export type UploadHandlers = { onProgress?: (fraction: number) => void; signal?: AbortSignal }

/**
 * The same cookie session as apiClient (credentials, one refresh-and-retry on 401), sent with XHR
 * only because fetch cannot report upload progress.
 */
async function sendForm(path: string, body: FormData, { onProgress, signal }: UploadHandlers): Promise<unknown> {
  const attempt = () => new Promise<{ status: number; text: string }>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('업로드를 취소했습니다.'))
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', apiUrl(path))
    xhr.withCredentials = true
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total) }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
    xhr.onerror = () => reject(new Error('서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.'))
    xhr.ontimeout = () => reject(new Error('서버 응답이 너무 늦습니다. 잠시 후 다시 시도해주세요.'))
    xhr.onabort = () => reject(new Error('업로드를 취소했습니다.'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
  const generation = sessionGeneration()
  let result = await attempt()
  if (result.status === 401 && await renewSessionAfter401(generation) === 'refreshed') result = await attempt()
  let data: unknown = null
  try { data = JSON.parse(result.text) } catch { /* not JSON (a proxy's error page) */ }
  if (result.status < 200 || result.status >= 300) throw createApiError(result.status, data, result.text)
  return data
}

export function saveSubmission(id: number, teamId: number, milestoneId: number, draft: SubmissionDraft, handlers: UploadHandlers = {}): Promise<Submission> {
  const body = new FormData()
  body.append('body', draft.body)
  draft.links.forEach(link => body.append('links', link))
  draft.newFiles.forEach(file => body.append('files', file))
  draft.removeFileIds.forEach(fileId => body.append('removeFileIds', String(fileId)))
  return sendForm(submissionPath(id, teamId, milestoneId), body, handlers) as Promise<Submission>
}
export const deleteSubmission = (id: number, teamId: number, milestoneId: number): Promise<void> =>
  requestNoContent(submissionPath(id, teamId, milestoneId), { method: 'DELETE' })

export const createTeamProject = (payload: TeamProjectWrite): Promise<TeamProjectSummary> =>
  request('/api/admin/team-projects', json('POST', payload))
export const updateTeamProject = (id: number, payload: TeamProjectWrite): Promise<TeamProjectSummary> =>
  request(adminPath(id), json('PUT', payload))
export const deleteTeamProject = (id: number): Promise<void> => requestNoContent(adminPath(id), { method: 'DELETE' })
export const getTeamProjectBoard = (id: number): Promise<Board> => request(`${adminPath(id)}/board`)
export const classifyTeamSubmission = (id: number, teamId: number, milestoneId: number, timing: SubmissionTiming): Promise<Submission> =>
  request(`${adminPath(id)}/teams/${teamId}/milestones/${milestoneId}/submission/timing`, json('PUT', { timing }))
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
