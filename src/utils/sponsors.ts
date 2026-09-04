export type SponsorSummary = {
  id: number | null
  name: string
  tierId: number | null
  logoUrl: string | null
  linkUrl: string | null
  description: string | null
  sinceDate: string | null
  untilDate: string | null
  anonymous: boolean
}

export type SponsorTierGroup = {
  id: number | null
  name: string
  color: string | null
  description: string | null
  sortOrder: number
  sponsors: SponsorSummary[]
}

export type SponsorHowTo = {
  title: string
  bodyHtml: string
  contactEmail: string
  contactLink: string
  bankNote: string
}

export type SponsorPageSettings = {
  heroTitle: string
  heroSubtitle: string
  bannerImageId: number | null
  introHtml: string
  accentColor: string
  layout: 'grid' | 'list'
  showTierLabels: boolean
  thankYouMessage: string
  howToSection: SponsorHowTo
  showCounts: boolean
}

export const ANONYMOUS_SPONSOR_NAME = '익명 후원자'
export const DEFAULT_SPONSOR_ACCENT = '#0071e3'

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export const defaultSponsorPageSettings: SponsorPageSettings = {
  heroTitle: '후원자',
  heroSubtitle: 'COM\'s의 활동을 함께 만들어주시는 분들입니다.',
  bannerImageId: null,
  introHtml: '',
  accentColor: DEFAULT_SPONSOR_ACCENT,
  layout: 'grid',
  showTierLabels: true,
  thankYouMessage: '후원해주신 모든 분들께 감사드립니다.',
  howToSection: { title: '후원 안내', bodyHtml: '', contactEmail: '', contactLink: '', bankNote: '' },
  showCounts: true,
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Only a literal #hex reaches the page — the accent is written into a scoped CSS
 * custom property, and anything else (a `url(...)`, a stray `;`) would be a CSS
 * injection rather than a colour.
 */
export function normalizeAccentColor(value: unknown, fallback = DEFAULT_SPONSOR_ACCENT) {
  const raw = text(value)
  return HEX_COLOR.test(raw) ? raw.toLowerCase() : fallback
}

export function normalizeSponsorPageSettings(value: Partial<SponsorPageSettings> | null | undefined): SponsorPageSettings {
  const howTo = value?.howToSection
  const layout = value?.layout === 'list' ? 'list' : 'grid'
  return {
    heroTitle: text(value?.heroTitle) || defaultSponsorPageSettings.heroTitle,
    heroSubtitle: text(value?.heroSubtitle) || defaultSponsorPageSettings.heroSubtitle,
    bannerImageId: typeof value?.bannerImageId === 'number' ? value.bannerImageId : null,
    introHtml: text(value?.introHtml),
    accentColor: normalizeAccentColor(value?.accentColor),
    layout,
    showTierLabels: value?.showTierLabels !== false,
    thankYouMessage: text(value?.thankYouMessage) || defaultSponsorPageSettings.thankYouMessage,
    howToSection: {
      title: text(howTo?.title) || defaultSponsorPageSettings.howToSection.title,
      bodyHtml: text(howTo?.bodyHtml),
      contactEmail: text(howTo?.contactEmail),
      contactLink: text(howTo?.contactLink),
      bankNote: text(howTo?.bankNote),
    },
    showCounts: value?.showCounts !== false,
  }
}

/** `until` is inclusive: a sponsorship that ends today is still current. */
export function isSponsorExpired(sponsor: { untilDate?: string | null }, today = new Date()) {
  const until = text(sponsor?.untilDate)
  if (!until) return false
  const end = new Date(`${until}T23:59:59`)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() < today.getTime()
}

export function sponsorDisplayName(sponsor: { name?: string | null; anonymous?: boolean }) {
  if (sponsor?.anonymous) return ANONYMOUS_SPONSOR_NAME
  return text(sponsor?.name) || ANONYMOUS_SPONSOR_NAME
}

/**
 * Second line of defence over the server projection: an anonymous sponsor keeps no logo,
 * no link and no description even if a stale cached payload still carries them.
 */
export function anonymizeSponsor(sponsor: SponsorSummary): SponsorSummary {
  if (!sponsor?.anonymous) return sponsor
  return { ...sponsor, id: null, name: ANONYMOUS_SPONSOR_NAME, logoUrl: null, linkUrl: null, description: null }
}

/**
 * Drops expired sponsors and then empty tier groups, and re-applies the anonymising rule.
 * The backend already excludes both, so this only matters for a payload cached across
 * midnight or served from a stale response.
 */
export function visibleSponsorGroups(groups: SponsorTierGroup[] | null | undefined, today = new Date()): SponsorTierGroup[] {
  if (!Array.isArray(groups)) return []
  return groups
    .map((group) => ({
      ...group,
      sponsors: (Array.isArray(group?.sponsors) ? group.sponsors : [])
        .filter((sponsor) => !isSponsorExpired(sponsor, today))
        .map(anonymizeSponsor),
    }))
    .filter((group) => group.sponsors.length > 0)
}

export function countSponsors(groups: SponsorTierGroup[] | null | undefined) {
  return visibleSponsorGroups(groups).reduce((total, group) => total + group.sponsors.length, 0)
}

/** "2024.03 ~ 2025.02", "2024.03 ~", or '' when neither date is set. */
export function sponsorPeriodLabel(sinceDate?: string | null, untilDate?: string | null) {
  const since = monthLabel(sinceDate)
  const until = monthLabel(untilDate)
  if (!since && !until) return ''
  if (since && until) return `${since} ~ ${until}`
  return since ? `${since} ~` : `~ ${until}`
}

function monthLabel(value?: string | null) {
  const raw = text(value)
  const match = raw.match(/^(\d{4})-(\d{2})/)
  return match ? `${match[1]}.${match[2]}` : ''
}

/** Fallback avatar glyph for a sponsor with no logo. */
export function sponsorInitial(name?: string | null) {
  // "60기 박채현" should read 박, not 6: drop a leading 기수 prefix.
  const raw = text(name).replace(/^\d{1,3}기\s*/, '')
  return raw ? Array.from(raw)[0] : '?'
}
