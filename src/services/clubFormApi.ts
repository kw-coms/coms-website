import { request, requestNoContent } from './apiClient'

export const FORM_CATEGORIES = { HACKATHON: '해커톤', TEAM_PROJECT: '팀 프로젝트', OTHER: '동아리 활동' }
export const QUESTION_KINDS = { SHORT: '짧은 답변', LONG: '긴 답변', SINGLE: '하나 선택', MULTIPLE: '여러 개 선택' }
export type FormCategory = keyof typeof FORM_CATEGORIES
export type QuestionKind = keyof typeof QUESTION_KINDS
export type Question = { id: string; label: string; kind: QuestionKind; required: boolean; options: string[] }
export type ClubForm = { id: number; title: string; description: string; category: FormCategory; hackathonEventId: number | null; questions: Question[]; accepting: boolean; open: boolean; closesAt: string | null; version: number }
export type ClubFormWrite = Omit<ClubForm, 'id' | 'open' | 'version'> & { version?: number }
type Summary = Omit<ClubForm, 'questions' | 'version' | 'accepting'> & { submitted: boolean }
export type Answers = Record<string, string[]>
type OwnResponse = { answers: Answers; submittedAt: string }
type FormView = { form: ClubForm; response: OwnResponse | null }
type ResponseRow = OwnResponse & { name: string; studentId: string }
type Responses = { items: ResponseRow[]; page: number; total: number }

const path = '/api/club-forms'
const admin = '/api/admin/club-forms'
export const listClubForms = (): Promise<Summary[]> => request(path)
export const getClubForm = (id: number): Promise<FormView> => request(path + '/' + id)
export const saveClubFormResponse = (id: number, formVersion: number, answers: Answers): Promise<OwnResponse> =>
  request(path + '/' + id + '/response', { method: 'PUT', body: JSON.stringify({ formVersion, answers }) })
export const listAdminClubForms = (): Promise<ClubForm[]> => request(admin)
export const saveClubForm = (id: number | undefined, form: ClubFormWrite): Promise<ClubForm> =>
  request(id === undefined ? admin : admin + '/' + id, { method: id === undefined ? 'POST' : 'PUT', body: JSON.stringify(form) })
export const deleteClubForm = (id: number): Promise<void> => requestNoContent(admin + '/' + id, { method: 'DELETE' })
export const listClubFormResponses = (id: number, page: number): Promise<Responses> => request(admin + '/' + id + '/responses?page=' + page)

export function isFormCategory(value: string | null): value is FormCategory {
  return value !== null && Object.hasOwn(FORM_CATEGORIES, value)
}
export function deadlineText(value: string | null) {
  return value ? value.slice(0, 16).replace('T', ' ') + ' (한국 시간)' : '마감 일시 미정'
}
