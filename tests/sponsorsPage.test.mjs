import assert from 'node:assert/strict'

import {
  ANONYMOUS_SPONSOR_NAME,
  DEFAULT_SPONSOR_ACCENT,
  anonymizeSponsor,
  countSponsors,
  isSponsorExpired,
  normalizeAccentColor,
  normalizeSponsorPageSettings,
  sponsorDisplayName,
  sponsorInitial,
  sponsorPeriodLabel,
  visibleSponsorGroups,
} from '../src/utils/sponsors.ts'

const TODAY = new Date('2026-09-04T12:00:00')

function sponsor(overrides = {}) {
  return {
    id: 1,
    name: '테스트 후원사',
    tierId: 1,
    logoUrl: '/api/sponsors/images/9',
    linkUrl: 'https://example.com',
    description: '설명',
    sinceDate: null,
    untilDate: null,
    anonymous: false,
    ...overrides,
  }
}

// --- 만료 판정: until 은 포함(inclusive) -------------------------------------------
assert.equal(isSponsorExpired(sponsor({ untilDate: null }), TODAY), false)
assert.equal(isSponsorExpired(sponsor({ untilDate: '2026-09-04' }), TODAY), false)
assert.equal(isSponsorExpired(sponsor({ untilDate: '2026-09-03' }), TODAY), true)
assert.equal(isSponsorExpired(sponsor({ untilDate: '2027-01-01' }), TODAY), false)
// 파싱할 수 없는 값 때문에 후원자가 사라지면 안 된다.
assert.equal(isSponsorExpired(sponsor({ untilDate: '언젠가' }), TODAY), false)

// --- 익명화: 이름/로고/링크/소개가 모두 지워진다 ------------------------------------
const anonymous = anonymizeSponsor(sponsor({ anonymous: true }))
assert.equal(anonymous.name, ANONYMOUS_SPONSOR_NAME)
assert.equal(anonymous.logoUrl, null)
assert.equal(anonymous.linkUrl, null)
assert.equal(anonymous.description, null)
assert.equal(sponsorDisplayName({ name: '공개사', anonymous: false }), '공개사')
assert.equal(sponsorDisplayName({ name: '숨김사', anonymous: true }), ANONYMOUS_SPONSOR_NAME)
assert.equal(sponsorDisplayName({ name: '   ', anonymous: false }), ANONYMOUS_SPONSOR_NAME)
// 공개 후원자는 원본 객체 그대로 통과한다.
const open = sponsor()
assert.equal(anonymizeSponsor(open), open)

// --- 그룹핑: 만료 제거 후 빈 등급 섹션까지 사라진다 ---------------------------------
const groups = visibleSponsorGroups([
  {
    id: 1,
    name: '골드',
    color: '#d4a017',
    description: null,
    sortOrder: 1,
    sponsors: [
      sponsor({ id: 11, name: '현재' }),
      sponsor({ id: 12, name: '만료', untilDate: '2026-09-03' }),
      sponsor({ id: 13, name: '익명', anonymous: true }),
    ],
  },
  { id: 2, name: '실버', color: null, description: null, sortOrder: 2, sponsors: [sponsor({ id: 21, untilDate: '2020-01-01' })] },
  { id: 3, name: '빈 등급', color: null, description: null, sortOrder: 3, sponsors: [] },
], TODAY)

assert.equal(groups.length, 1, '후원자가 남은 등급만 남아야 한다')
assert.deepEqual(groups[0].sponsors.map((s) => s.name), ['현재', ANONYMOUS_SPONSOR_NAME])
assert.equal(groups[0].sponsors[1].logoUrl, null)
assert.equal(countSponsors(groups), 2)
assert.deepEqual(visibleSponsorGroups(null), [])
assert.deepEqual(visibleSponsorGroups(undefined), [])

// --- 강조 색상: #hex 만 통과 --------------------------------------------------------
assert.equal(normalizeAccentColor('#112233'), '#112233')
assert.equal(normalizeAccentColor('#ABC'), '#abc')
assert.equal(normalizeAccentColor('red'), DEFAULT_SPONSOR_ACCENT)
assert.equal(normalizeAccentColor('#112233; background: url(x)'), DEFAULT_SPONSOR_ACCENT)
assert.equal(normalizeAccentColor(null), DEFAULT_SPONSOR_ACCENT)

// --- 기간 라벨 ----------------------------------------------------------------------
assert.equal(sponsorPeriodLabel('2024-03-01', '2025-02-28'), '2024.03 ~ 2025.02')
assert.equal(sponsorPeriodLabel('2024-03-01', null), '2024.03 ~')
assert.equal(sponsorPeriodLabel(null, '2025-02-28'), '~ 2025.02')
assert.equal(sponsorPeriodLabel(null, null), '')

// --- 로고가 없을 때의 이니셜 --------------------------------------------------------
assert.equal(sponsorInitial('광운대'), '광')
assert.equal(sponsorInitial('COM\'s'), 'C')
assert.equal(sponsorInitial(''), '?')

// --- 페이지 설정 기본값 채우기 ------------------------------------------------------
const settings = normalizeSponsorPageSettings({ heroTitle: '  ', layout: 'carousel', showCounts: false, accentColor: 'nope' })
assert.equal(settings.heroTitle, '후원자')
assert.equal(settings.layout, 'grid', '알 수 없는 레이아웃은 grid 로 되돌린다')
assert.equal(settings.showCounts, false)
assert.equal(settings.showTierLabels, true)
assert.equal(settings.accentColor, DEFAULT_SPONSOR_ACCENT)
assert.equal(settings.howToSection.title, '후원 안내')
assert.equal(normalizeSponsorPageSettings({ layout: 'list' }).layout, 'list')
assert.equal(normalizeSponsorPageSettings(null).thankYouMessage.length > 0, true)

console.log('sponsorsPage tests passed')
