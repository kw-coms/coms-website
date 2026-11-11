import assert from 'node:assert/strict'

import {
  defaultSiteSettings,
  normalizeAdminSiteSettings,
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
    { label: 'Mail', href: 'mailto:test@example.com' },
    { label: 'Broken', href: '' },
  ],
  askEnabled: true,
  askInboxEmail: 'private@example.com',
})

assert.equal(remote.semesterLabel, '2026-2 모집')
assert.equal(remote.homeHeroCopy, '새 학기 모집 안내입니다.')
assert.deepEqual(remote.contactLinks, [{ label: 'Mail', href: 'mailto:test@example.com' }])
assert.equal(remote.askEnabled, true)
assert.equal(Object.hasOwn(remote, 'askInboxEmail'), false)

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
assert.equal(fallback.askEnabled, false)

const admin = normalizeAdminSiteSettings({ ...remote, askInboxEmail: ' private@example.com ' })
assert.equal(admin.askInboxEmail, 'private@example.com')
assert.deepEqual(siteSettingsPayload(admin), {
  semesterLabel: '2026-2 모집',
  recruitmentStatus: '모집 중',
  recruitmentPeriod: '8월 25일 - 9월 5일',
  homeHeroTitle: 'COM\'s 모집',
  homeHeroCopy: '새 학기 모집 안내입니다.',
  contactLinks: [{ label: 'Mail', href: 'mailto:test@example.com' }],
  askInboxEmail: 'private@example.com',
})

console.log('site settings api contract passed')
