import { API_BASE_URL, apiUrl, request, requestBlob, requestNoContent } from './apiClient'
import {
  normalizeSponsorPageSettings,
  type SponsorPageSettings,
  type SponsorTierGroup,
} from '../utils/sponsors'

export type SponsorAdminRow = {
  id: number
  name: string
  tierId: number | null
  tierName: string | null
  logoImageId: number | null
  logoUrl: string | null
  linkUrl: string | null
  description: string | null
  amountNote: string | null
  sinceDate: string | null
  untilDate: string | null
  anonymous: boolean
  visible: boolean
  expired: boolean
  sortOrder: number
}

export type SponsorTier = {
  id: number
  name: string
  color: string | null
  description: string | null
  sortOrder: number
}

export type SponsorPagePayload = {
  settings: SponsorPageSettings
  bannerImageUrl: string | null
  sponsorCount: number
  tierCount: number
}

/**
 * Sponsor images are served from the API origin, not the SPA origin, so a bare
 * "/api/sponsors/images/3" would 404 whenever VITE_API_BASE_URL points elsewhere.
 */
export function sponsorImageSrc(url?: string | null) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return API_BASE_URL ? apiUrl(url) : url
}

// ---- Public reads ------------------------------------------------------------------

export async function listSponsors(): Promise<SponsorTierGroup[]> {
  const data = await request('/api/sponsors')
  return Array.isArray(data) ? data : []
}

export async function getSponsorPage(): Promise<SponsorPagePayload> {
  const data = await request('/api/sponsors/page')
  return {
    settings: normalizeSponsorPageSettings(data?.settings),
    bannerImageUrl: data?.bannerImageUrl ?? null,
    sponsorCount: Number(data?.sponsorCount) || 0,
    tierCount: Number(data?.tierCount) || 0,
  }
}

// ---- 회장 전용 ---------------------------------------------------------------------

export async function listAdminSponsors(): Promise<SponsorAdminRow[]> {
  const data = await request('/api/admin/sponsors')
  return Array.isArray(data) ? data : []
}

export function createSponsor(body: Partial<SponsorAdminRow>) {
  return request('/api/admin/sponsors', { method: 'POST', body: JSON.stringify(body) })
}

export function updateSponsor(id: number, body: Partial<SponsorAdminRow>) {
  return request(`/api/admin/sponsors/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteSponsor(id: number) {
  return requestNoContent(`/api/admin/sponsors/${id}`, { method: 'DELETE' })
}

export async function reorderSponsors(ids: number[]): Promise<SponsorAdminRow[]> {
  const data = await request('/api/admin/sponsors/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) })
  return Array.isArray(data) ? data : []
}

export async function listAdminSponsorTiers(): Promise<SponsorTier[]> {
  const data = await request('/api/admin/sponsors/tiers')
  return Array.isArray(data) ? data : []
}

export function createSponsorTier(body: Partial<SponsorTier>) {
  return request('/api/admin/sponsors/tiers', { method: 'POST', body: JSON.stringify(body) })
}

export function updateSponsorTier(id: number, body: Partial<SponsorTier>) {
  return request(`/api/admin/sponsors/tiers/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteSponsorTier(id: number) {
  return requestNoContent(`/api/admin/sponsors/tiers/${id}`, { method: 'DELETE' })
}

export async function reorderSponsorTiers(ids: number[]): Promise<SponsorTier[]> {
  const data = await request('/api/admin/sponsors/tiers/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) })
  return Array.isArray(data) ? data : []
}

export async function getAdminSponsorPageSettings(): Promise<SponsorPageSettings> {
  return normalizeSponsorPageSettings(await request('/api/admin/sponsors/page'))
}

export async function saveSponsorPageSettings(settings: SponsorPageSettings): Promise<SponsorPageSettings> {
  return normalizeSponsorPageSettings(await request('/api/admin/sponsors/page', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }))
}

export function uploadSponsorImage(file: File): Promise<{ id: number; url: string }> {
  const form = new FormData()
  form.append('image', file)
  return request('/api/admin/sponsors/images', { method: 'POST', body: form })
}

export function deleteSponsorImage(id: number) {
  return requestNoContent(`/api/admin/sponsors/images/${id}`, { method: 'DELETE' })
}

export function exportSponsorsCsv() {
  return requestBlob('/api/admin/sponsors/export.csv')
}
