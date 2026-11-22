import { request } from './apiClient'

export const OPPORTUNITY_CATEGORIES = {
  HACKATHON: '해커톤',
  CONTEST: '코딩 대회',
  TRAINING: '교육·부트캠프',
} as const

export type OpportunityCategory = keyof typeof OPPORTUNITY_CATEGORIES
export type OpportunityStatus = 'PENDING' | 'PUBLISHED' | 'IGNORED'

export type OpportunityDates = {
  applicationStart: string | null
  applicationEnd: string | null
  eventStart: string | null
  eventEnd: string | null
}

export type OpportunityFields = OpportunityDates & { title: string; category: OpportunityCategory }
export type Opportunity = OpportunityFields & {
  id: number
  sourceName: string
  sourceUrl: string
  publishedAt: string | null
}
export type ReviewOpportunity = Opportunity & {
  status: OpportunityStatus
  version: number
  collectedAt: string
  published: boolean
  aiAssisted: boolean
}

export type CollectionStatus = {
  enabled: boolean
  running: boolean
  lastRunAt: string | null
  sources: Array<{ key: string; name: string; result: 'SUCCESS' | 'ERROR' | null; found: number; changed: number }>
}

type ReviewPage = { items: ReviewOpportunity[]; total: number; page: number; size: number }
type ReviewWrite = { version: number } & (
  { action: 'PUBLISH' } & OpportunityFields | { action: 'IGNORE' | 'UNPUBLISH' }
)

const admin = '/api/admin/opportunities'
export const opportunityQuery = ['opportunities'] as const
export const opportunityReviewQuery = ['admin', 'opportunities'] as const

export function listOpportunities(): Promise<Opportunity[]> {
  return request('/api/opportunities')
}

export function listReviewOpportunities(status: OpportunityStatus, page: number): Promise<ReviewPage> {
  return request(`${admin}?status=${status}&page=${page}`)
}

export function getOpportunityCollection(): Promise<CollectionStatus> {
  return request(admin + '/collection')
}

export function collectOpportunities(): Promise<CollectionStatus> {
  return request(admin + '/collect', { method: 'POST' })
}

export function reviewOpportunity(id: number, body: ReviewWrite): Promise<ReviewOpportunity> {
  return request(admin + '/' + id, { method: 'PUT', body: JSON.stringify(body) })
}

export function isOpportunityCategory(value: string | null): value is OpportunityCategory {
  return value !== null && Object.hasOwn(OPPORTUNITY_CATEGORIES, value)
}
