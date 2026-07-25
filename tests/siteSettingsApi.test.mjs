import assert from 'node:assert/strict'

import {
  defaultSiteSettings,
  normalizeSiteSettings,
  siteSettingsPayload,
} from '../src/services/siteSettingsApi.ts'

const remote = normalizeSiteSettings({
  semesterLabel: '2026-2 모집',
  recruitmentStatus: '모집 중',
  recruitmentPeriod: '8월 25일 - 9월 5일',
  homeHeroTitle: 'COM\'s 모집',
  homeHeroCopy: '새 학기 모집 안내입니다.',
  contactLinks: [
    { label: 'Mail', href: 'mailto:kwcoms69@gmail.com' },
    { label: 'Broken', href: '' },
  ],
})

assert.equal(remote.semesterLabel, '2026-2 모집')
assert.equal(remote.homeHeroCopy, '새 학기 모집 안내입니다.')
assert.deepEqual(remote.contactLinks, [{ label: 'Mail', href: 'mailto:kwcoms69@gmail.com' }])

const fallback = normalizeSiteSettings({
  semesterLabel: '',
  recruitmentStatus: '',
  recruitmentPeriod: '',
  homeHeroTitle: '',
  homeHeroCopy: '',
  contactLinks: [],
})

assert.equal(fallback.semesterLabel, defaultSiteSettings.semesterLabel)
assert.equal(fallback.homeHeroTitle, defaultSiteSettings.homeHeroTitle)
assert.ok(fallback.contactLinks.length > 0)

assert.deepEqual(siteSettingsPayload(remote), {
  semesterLabel: '2026-2 모집',
  recruitmentStatus: '모집 중',
  recruitmentPeriod: '8월 25일 - 9월 5일',
  homeHeroTitle: 'COM\'s 모집',
  homeHeroCopy: '새 학기 모집 안내입니다.',
  contactLinks: [{ label: 'Mail', href: 'mailto:kwcoms69@gmail.com' }],
})

console.log('site settings api contract passed')
