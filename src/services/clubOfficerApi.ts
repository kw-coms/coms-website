import { request, requestNoContent } from './apiClient'
import type { ImportRow, OfficerRole, TermView } from '../features/clubOfficers/clubOfficers'

// 관리자 화면용: 연결된 명부 행의 id 와 이름까지 내려온다.
export type AdminOfficer = {
  id: number; role: OfficerRole; name: string; position: number
  eligibleMemberId: number | null; eligibleMemberName: string | null; generation: string | null
}
export type AdminTerm = { id: number; label: string; year: number; position: number; note: string; officers: AdminOfficer[] }
export type TermWrite = { label: string; year: number; note: string }
export type ImportResult = { created: number; updated: number; unchanged: number }

const base = '/api/admin/club-officers'
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const listClubOfficers = (): Promise<TermView[]> => request('/api/club-officers')

export const listAdminClubOfficers = (): Promise<AdminTerm[]> => request(base)
export const createTerm = (body: TermWrite): Promise<AdminTerm> => request(`${base}/terms`, json('POST', body))
export const updateTerm = (id: number, body: TermWrite): Promise<AdminTerm> => request(`${base}/terms/${id}`, json('PUT', body))
export const deleteTerm = (id: number): Promise<void> => requestNoContent(`${base}/terms/${id}`, { method: 'DELETE' })
export const reorderTerms = (ids: number[]): Promise<AdminTerm[]> => request(`${base}/terms/order`, json('PUT', { ids }))
export const addOfficer = (termId: number, body: { role: OfficerRole; name: string }): Promise<AdminTerm> =>
  request(`${base}/terms/${termId}/officers`, json('POST', body))
export const updateOfficer = (id: number, body: { role: OfficerRole; name: string }): Promise<AdminTerm> =>
  request(`${base}/officers/${id}`, json('PUT', body))
export const deleteOfficer = (id: number): Promise<AdminTerm> => request(`${base}/officers/${id}`, { method: 'DELETE' })
export const reorderOfficers = (termId: number, ids: number[]): Promise<AdminTerm> =>
  request(`${base}/terms/${termId}/officers/order`, json('PUT', { ids }))
export const linkOfficer = (id: number, eligibleMemberId: number | null): Promise<AdminTerm> =>
  request(`${base}/officers/${id}/link`, json('PUT', { eligibleMemberId }))
export const importOfficerRows = (rows: ImportRow[]): Promise<ImportResult> => request(`${base}/import`, json('POST', { rows }))
