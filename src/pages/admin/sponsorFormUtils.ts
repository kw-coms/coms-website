import type { SponsorAdminRow } from '../../services/sponsorApi'

/** 후원자 폼의 편집 상태 — 날짜/등급은 input 값 그대로 문자열로 들고 있는다. */
export type SponsorFormValue = {
  name: string
  tierId: string
  logoImageId: number | null
  logoUrl: string | null
  linkUrl: string
  description: string
  amountNote: string
  sinceDate: string
  untilDate: string
  anonymous: boolean
  visible: boolean
}

export function sponsorFormValue(row?: SponsorAdminRow | null): SponsorFormValue {
  return {
    name: row?.name || '',
    tierId: row?.tierId == null ? '' : String(row.tierId),
    logoImageId: row?.logoImageId ?? null,
    logoUrl: row?.logoUrl ?? null,
    linkUrl: row?.linkUrl || '',
    description: row?.description || '',
    amountNote: row?.amountNote || '',
    sinceDate: row?.sinceDate || '',
    untilDate: row?.untilDate || '',
    anonymous: Boolean(row?.anonymous),
    visible: row?.visible !== false,
  }
}

export function sponsorFormPayload(form: SponsorFormValue) {
  return {
    name: form.name.trim(),
    tierId: form.tierId ? Number(form.tierId) : null,
    logoImageId: form.logoImageId,
    linkUrl: form.linkUrl.trim() || null,
    description: form.description.trim() || null,
    amountNote: form.amountNote.trim() || null,
    sinceDate: form.sinceDate || null,
    untilDate: form.untilDate || null,
    anonymous: form.anonymous,
    visible: form.visible,
  }
}

