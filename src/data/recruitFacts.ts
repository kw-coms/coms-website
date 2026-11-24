import { defaultSiteSettings, type SiteSettings } from '../services/siteSettingsApi'

// Shared recruitment copy for the activity aside and recruit pages.
export function recruitSummary(settings: SiteSettings = defaultSiteSettings) {
  return `마감 없이 받고 있고, 코딩이 처음이어도 괜찮습니다. 회비는 ${settings.recruitFee}, 동아리방은 ${settings.recruitRoom}입니다.`
}

export function recruitFactRows(settings: SiteSettings = defaultSiteSettings): { label: string; value: string }[] {
  return [
    { label: '모집', value: `${settings.recruitCohort} 상시 모집, 마감 없음` },
    { label: '경험', value: '코딩이 처음이어도 괜찮아요' },
    { label: '회비', value: settings.recruitFee },
    { label: '동아리방', value: settings.recruitRoom },
  ]
}
