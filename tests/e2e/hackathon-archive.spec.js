import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockOptionalApis } from './visualSupport.js'
import { legacyEvent, doneEvent, upcomingEvent, progressEvent, summary } from '../hackathonFixture.mjs'

test.use({ serviceWorkers: 'block' })

const events = [upcomingEvent, legacyEvent, progressEvent, doneEvent]

async function mockArchive(page) {
  await mockOptionalApis(page)
  await page.route('**/api/hackathon/events', route => route.fulfill({ json: events.map(summary) }))
  await page.route(/\/api\/hackathon\/events\/\d+$/, route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1))
    const event = events.find(item => item.id === id)
    return event ? route.fulfill({ json: event }) : route.fulfill({ status: 404, json: { message: 'not found' } })
  })
}

for (const width of [320, 1280]) {
  test(`archive lists every published event by year with status badges at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockArchive(page)
    await page.goto('/hackathon')
    await expect(page.getByRole('heading', { name: '해커톤 아카이브', level: 1 })).toBeVisible()
    const years = await page.getByRole('heading', { level: 2 }).allTextContents()
    expect(years.filter(text => /^\d{4}년$/.test(text))).toEqual(['2027년', '2026년', '2025년'])
    const cards = page.locator('li > a.hackathon-card')
    await expect(cards).toHaveCount(4)
    await expect(cards.nth(0)).toContainText('시작 예정')
    await expect(cards.nth(0)).toContainText('2027년 2학기')
    await expect(cards.nth(0)).toContainText('11/6(토) 18:00 ~ 11/13(토) 04:00')
    await expect(cards.nth(1)).toContainText('평가 중')
    await expect(cards.nth(1)).toContainText('11/8(일) 18:00 ~ 11/15(일) 04:00')
    await expect(cards.nth(1)).toContainText('참가 3팀')
    await expect(cards.nth(2)).toContainText('진행 중')
    await expect(cards.nth(3)).toContainText('완료')
    await expect(cards.nth(3)).toContainText('결과 공개')
    // 평가 중인 행사는 맨 위의 강조 영역에서도 바로 열린다.
    await expect(page.getByRole('region', { name: '지금 평가할 수 있어요' }).getByRole('link')).toHaveAttribute('href', '/hackathon/1')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([])
  })
}

test('a finished event opens from the archive with its projects and materials but no review form', async ({ page }) => {
  await mockArchive(page)
  await page.goto('/hackathon')
  await page.locator('li > a.hackathon-card', { hasText: '2025년 2학기 해커톤' }).click()
  await expect(page).toHaveURL(/\/hackathon\/3$/)
  await expect(page.getByRole('heading', { name: '2025년 2학기 해커톤', level: 1 })).toBeVisible()
  await expect(page.getByText('2025년 2학기', { exact: true })).toBeVisible()
  await expect(page.getByText('완료', { exact: true })).toBeVisible()
  await expect(page.getByText('11/8(토) 18:00 ~ 11/15(토) 04:00')).toBeVisible()
  await expect(page.getByRole('heading', { name: '재난', exact: true })).toBeVisible()
  await expect(page.getByText('각 항목 20점 만점')).toBeVisible()
  await expect(page.getByRole('link', { name: '2025 개회식 자료' })).toHaveAttribute('href', '/hackathon-2025/opening.pptx')
  await expect(page.locator('#alpha')).toContainText('재난 알림 서비스')
  await expect(page.locator('#alpha').getByRole('link', { name: '알파 계획서' })).toHaveAttribute('href', '/hackathon-2025/alpha/proposal.pdf')
  await expect(page.locator('#beta')).toContainText('대피소 안내 서비스')
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '평가 제출' })).toHaveCount(0)
  await expect(page.getByLabel('기수', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '평가 링크 복사' })).toHaveCount(0)
})

test('published results show the ranking and criteria averages without reviewer details', async ({ page }) => {
  await mockArchive(page)
  await page.goto('/hackathon/3')
  const table = page.getByRole('region', { name: '최종 순위표' })
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('1위')
  await expect(rows.nth(0)).toContainText('알파')
  await expect(rows.nth(0)).toContainText('88.50점')
  await expect(rows.nth(0)).toContainText('87.00점')
  await expect(rows.nth(0)).toContainText('90.00점')
  await expect(rows.nth(0)).toContainText('17.50')
  await expect(rows.nth(1)).toContainText('2위')
  await expect(table.getByRole('columnheader', { name: '완성도' })).toBeVisible()
  await expect(page.getByText('평가자 이름과 개별 의견은 공개하지 않습니다.')).toBeVisible()
})

test('results stay hidden and the review form stays open for an event under evaluation', async ({ page }) => {
  await mockArchive(page)
  await page.goto('/hackathon/1')
  await expect(page.getByText('평가 중', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: '최종 순위표' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'wargether 채점' })).toBeVisible()
})

test('upcoming and in-progress events explain that evaluation has not opened', async ({ page }) => {
  await mockArchive(page)
  await page.goto('/hackathon/4')
  await expect(page.getByText('시작 예정', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '아직 시작 전인 행사입니다' })).toBeVisible()
  await page.goto('/hackathon/5')
  await expect(page.getByText('진행 중', { exact: true })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
})
