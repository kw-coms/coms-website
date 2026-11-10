import { request, requestOptional } from './apiClient'

// 동아리방 출입 비밀번호 — 회원(USER) 이상 전용 endpoint.
export function getClubRoom(): Promise<{ doorCode: string }> {
  return request('/api/club-room')
}

export function updateClubRoom(doorCode: string): Promise<{ doorCode: string }> {
  return request('/api/admin/club-room', {
    method: 'PUT',
    body: JSON.stringify({ doorCode }),
  })
}

export type SiteSettingsContactLink = {
  label: string
  href: string
}

export type SiteSettings = {
  semesterLabel: string
  recruitmentStatus: string
  recruitmentPeriod: string
  homeHeroTitle: string
  homeHeroCopy: string
  contactLinks: SiteSettingsContactLink[]
  askEnabled: boolean
}

export type AdminSiteSettings = SiteSettings & { askInboxEmail: string }

export const defaultSiteSettings: SiteSettings = {
  semesterLabel: '2026 Semester Ready',
  recruitmentStatus: '모집 안내',
  recruitmentPeriod: '상세 일정은 COM\'s 공식 채널과 학내 공지를 통해 안내됩니다.',
  homeHeroTitle: 'COM\'s',
  homeHeroCopy: '배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.',
  contactLinks: [{ label: 'Mail', href: 'mailto:kwcoms69@gmail.com' }],
  askEnabled: false,
}

export const defaultAdminSiteSettings: AdminSiteSettings = { ...defaultSiteSettings, askInboxEmail: '' }

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanLinks(value: unknown): SiteSettingsContactLink[] {
  if (!Array.isArray(value)) return defaultSiteSettings.contactLinks
  const links = value
    .map((link) => ({
      label: clean(link?.label),
      href: clean(link?.href),
    }))
    .filter((link) => link.label && link.href)
  return links.length > 0 ? links : defaultSiteSettings.contactLinks
}

export function normalizeSiteSettings(value: Partial<SiteSettings> | null | undefined): SiteSettings {
  return {
    semesterLabel: clean(value?.semesterLabel) || defaultSiteSettings.semesterLabel,
    recruitmentStatus: clean(value?.recruitmentStatus) || defaultSiteSettings.recruitmentStatus,
    recruitmentPeriod: clean(value?.recruitmentPeriod) || defaultSiteSettings.recruitmentPeriod,
    homeHeroTitle: clean(value?.homeHeroTitle) || defaultSiteSettings.homeHeroTitle,
    homeHeroCopy: clean(value?.homeHeroCopy) || defaultSiteSettings.homeHeroCopy,
    contactLinks: cleanLinks(value?.contactLinks),
    askEnabled: value?.askEnabled === true,
  }
}

export function normalizeAdminSiteSettings(value: Partial<AdminSiteSettings> | null | undefined): AdminSiteSettings {
  return { ...normalizeSiteSettings(value), askInboxEmail: clean(value?.askInboxEmail) }
}

export function siteSettingsPayload(settings: AdminSiteSettings) {
  const { askEnabled, ...publicFields } = normalizeSiteSettings(settings)
  void askEnabled
  return { ...publicFields, askInboxEmail: clean(settings.askInboxEmail) }
}

export async function getPublicSiteSettings() {
  const data = await requestOptional('/api/site-settings', {}, defaultSiteSettings)
  return normalizeSiteSettings(data)
}

export async function getAdminSiteSettings() {
  return normalizeAdminSiteSettings(await request('/api/admin/site-settings'))
}

export async function publishSiteSettings(settings: AdminSiteSettings) {
  return normalizeAdminSiteSettings(await request('/api/admin/site-settings', {
    method: 'PUT',
    body: JSON.stringify(siteSettingsPayload(settings)),
  }))
}
