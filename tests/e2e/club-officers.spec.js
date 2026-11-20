import { expect, test } from '@playwright/test'
import { expectMembersGate, mockAdminApis, mockOptionalApis } from './visualSupport.js'

test.use({ serviceWorkers: 'block' })

// 가상의 이름만 쓴다. 실제 명단은 저장소에 넣지 않는다.
const USER = { id: 5, name: '일반회원', studentId: '2021000005', role: 'USER', emailVerified: true }
const TERMS = [
  { id: 4, label: '71대', year: 2026, position: 1, note: '2학기', officers: [
    { id: 41, role: 'PRESIDENT', name: '가나다', generation: '50' },
    { id: 42, role: 'VICE_PRESIDENT', name: '라마바', generation: null },
  ] },
  { id: 3, label: '70대', year: 2026, position: 0, note: '1학기', officers: [
    { id: 31, role: 'PRESIDENT', name: '사아자', generation: null },
    { id: 32, role: 'VICE_PRESIDENT', name: '차카타', generation: '48' },
    { id: 33, role: 'VICE_PRESIDENT', name: '파하가', generation: null },
  ] },
  { id: 2, label: '52대', year: 2018, position: 0, note: '', officers: [
    { id: 21, role: 'PRESIDENT', name: '나다라', generation: null },
  ] },
  { id: 1, label: '초대', year: 1970, position: 0, note: '', officers: [
    { id: 11, role: 'PRESIDENT', name: '마바사', generation: null },
  ] },
]

async function installMemberApi(page, terms = TERMS) {
  await mockOptionalApis(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: USER }))
  await page.route('**/api/club-officers', (route) => route.fulfill({ json: terms }))
}

test('guests see the members gate and never ask for the officer list', async ({ page }) => {
  await mockOptionalApis(page)
  const asked = []
  page.on('request', (request) => { if (/\/api\/club-officers/.test(request.url())) asked.push(request.url()) })
  await page.goto('/officers')
  await expectMembersGate(page, '/officers')
  expect(asked).toEqual([])
})

test('the member page groups terms by decade, shows 기수 badges and filters by name, year and term', async ({ page }) => {
  await installMemberApi(page)
  await page.goto('/officers')
  await expect(page.getByRole('heading', { level: 1, name: '역대 회장단' })).toBeVisible()
  await expect(page).toHaveTitle(/역대 회장단/)
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([/^2020년대/, /^2010년대/, /^1970년대/])
  await expect(page.getByRole('status').filter({ hasText: '총 4개 임기' })).toBeVisible()

  const latest = page.getByRole('listitem').filter({ hasText: '71대' })
  await expect(latest).toContainText('2026년')
  await expect(latest.locator('.of-role').filter({ hasText: '회장' }).first()).toContainText('가나다')
  await expect(latest).toContainText('50기')
  await expect(latest.locator('.of-role').filter({ hasText: '부회장' })).toContainText('라마바')
  // 같은 해에서는 나중 임기(71대)가 먼저 나온다
  await expect(page.locator('.of-term .of-label')).toHaveText(['71대', '70대', '52대', '초대'])
  // 부회장이 둘이면 둘 다 보인다
  await expect(page.getByRole('listitem').filter({ hasText: '70대' })).toContainText('차카타')
  await expect(page.getByRole('listitem').filter({ hasText: '70대' })).toContainText('파하가')

  const search = page.getByRole('searchbox', { name: '회장단 검색' })
  await search.fill('나다라')
  await expect(page.locator('.of-term .of-label')).toHaveText(['52대'])
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([/^2010년대/])
  await search.fill('1970')
  await expect(page.locator('.of-term .of-label')).toHaveText(['초대'])
  await search.fill('71대')
  await expect(page.locator('.of-term .of-label')).toHaveText(['71대'])
  await search.fill('48기')
  await expect(page.locator('.of-term .of-label')).toHaveText(['70대'])
  await search.fill('없는사람')
  await expect(page.getByText('‘없는사람’에 해당하는 임기가 없습니다.')).toBeVisible()
  await expect(page.locator('.of-term')).toHaveCount(0)
  await search.fill('')
  await expect(page.locator('.of-term')).toHaveCount(4)
})

test('an empty list and a failed load each say so', async ({ page }) => {
  await installMemberApi(page, [])
  await page.goto('/officers')
  await expect(page.getByText('아직 등록된 회장단 기록이 없습니다.')).toBeVisible()
  await page.unroute('**/api/club-officers')
  await page.route('**/api/club-officers', (route) => route.fulfill({ status: 500, json: { message: '오류' } }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('회장단 기록을 불러오지 못했습니다')
})

for (const width of [390, 320]) {
  test(`the member page fits a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const longName = '아주아주아주긴이름을가진사람'.repeat(2)
    await installMemberApi(page, [{ ...TERMS[0], officers: [{ id: 99, role: 'PRESIDENT', name: longName, generation: '50' }, ...TERMS[0].officers] }, ...TERMS.slice(1)])
    await page.goto('/officers')
    await expect(page.locator('.of-term')).toHaveCount(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const jump = page.getByRole('navigation', { name: '연대 바로가기' }).getByRole('button', { name: '1970년대' })
    expect((await jump.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await jump.click()
    await expect(page.getByRole('heading', { level: 2, name: /1970년대/ })).toBeInViewport()
  })
}

// ---- 관리 -------------------------------------------------------------------------------------

const ROSTER = [
  { id: 701, name: '가나다', generation: '50', department: '컴퓨터정보공학부', studentId: '2020000001' },
  { id: 702, name: '가나다', generation: '45', department: '소프트웨어학부', studentId: '2015000002' },
]

/** 관리 API 의 메모리판. 일괄 등록은 서버와 같이 임기 이름을 키로 만들거나 고친다. */
async function installAdminApi(page) {
  const db = { terms: structuredClone(TERMS).map((term) => ({ ...term, officers: term.officers.map((o, i) => ({ ...o, position: i, eligibleMemberId: null, eligibleMemberName: null })) })), imports: [], links: [], next: 500 }
  await mockAdminApis(page)
  await page.route('**/api/admin/eligible-members', (route) => route.fulfill({ json: ROSTER }))
  await page.route(/\/api\/admin\/club-officers(\/.*)?$/, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/admin/club-officers', '')
    const method = request.method()
    const json = (body, status = 200) => route.fulfill({ status, json: body })
    if (method === 'GET' && path === '') return json(db.terms)
    if (method === 'POST' && path === '/import') {
      const { rows } = request.postDataJSON()
      db.imports.push(rows)
      let created = 0
      let updated = 0
      let unchanged = 0
      for (const row of rows) {
        const officers = [...row.presidents.map((name) => ['PRESIDENT', name]), ...row.vices.map((name) => ['VICE_PRESIDENT', name])]
          .map(([role, name], position) => ({ id: db.next++, role, name, position, generation: null, eligibleMemberId: null, eligibleMemberName: null }))
        const current = db.terms.find((term) => term.label === row.label)
        if (!current) { created += 1; db.terms.push({ id: db.next++, label: row.label, year: row.year, position: 0, note: '', officers }) }
        else if (current.year === row.year && JSON.stringify(current.officers.map((o) => [o.role, o.name])) === JSON.stringify(officers.map((o) => [o.role, o.name]))) unchanged += 1
        else { updated += 1; current.year = row.year; current.officers = officers }
      }
      db.terms.sort((a, b) => b.year - a.year || b.position - a.position)
      return json({ created, updated, unchanged })
    }
    let match
    if (method === 'PUT' && (match = /^\/officers\/(\d+)\/link$/.exec(path))) {
      const { eligibleMemberId } = request.postDataJSON()
      db.links.push([Number(match[1]), eligibleMemberId])
      const term = db.terms.find((item) => item.officers.some((o) => o.id === Number(match[1])))
      const officer = term.officers.find((o) => o.id === Number(match[1]))
      const row = ROSTER.find((item) => item.id === eligibleMemberId)
      Object.assign(officer, { eligibleMemberId, eligibleMemberName: row?.name ?? null, generation: row?.generation ?? null })
      return json(term)
    }
    return json({ message: `unhandled ${method} ${path}` }, 500)
  })
  return db
}

test('the admin tab sits in the content group and lists the terms', async ({ page }) => {
  await installAdminApi(page)
  await page.goto('/admin?tab=club-officers')
  await expect(page.getByRole('navigation', { name: '운영 패널 메뉴' }).getByRole('tablist', { name: '콘텐츠' }).getByRole('tab', { name: '역대 회장단' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: '역대 회장단 관리' })).toBeVisible()
  await expect(page.getByRole('article', { name: '71대 2026년' })).toContainText('가나다')
  await expect(page.getByRole('article', { name: '71대 2026년' })).toContainText('명부 미연결')
  await expect(page.getByRole('link', { name: '회원용 페이지' })).toHaveAttribute('href', '/officers')
})

test('bulk paste previews create / update / unchanged / invalid lines, then applies only the valid ones', async ({ page }) => {
  const db = await installAdminApi(page)
  await page.goto('/admin?tab=club-officers')
  const panel = page.getByRole('region', { name: '역대 회장단 관리' })
  const paste = [
    '52대\t2018\t나다라\t',               // 그대로 → 변경 없음
    '53대\t2019\t바사아\t자차카, 타파하',    // 새 임기, 부회장 두 명
    '초대\t1971\t마바사\t',               // 연도가 바뀜 → 수정
    '54대\t19\t카타파\t',                 // 연도 오류
    '55대\t2020',                          // 칸 부족
  ].join('\n')
  await panel.getByLabel('붙여넣을 내용').fill(paste)
  await expect(panel.getByRole('button', { name: /임기 적용/ })).toHaveCount(0)
  await panel.getByRole('button', { name: '미리보기' }).click()

  const preview = panel.getByRole('region', { name: '일괄 등록 미리보기' })
  await expect(preview.getByRole('row')).toHaveCount(4)
  await expect(preview.getByRole('row', { name: /52대/ })).toContainText('변경 없음')
  await expect(preview.getByRole('row', { name: /53대/ })).toContainText('새로 추가')
  await expect(preview.getByRole('row', { name: /53대/ })).toContainText('자차카, 타파하')
  await expect(preview.getByRole('row', { name: /초대/ })).toContainText('수정')
  const issues = panel.getByRole('alert').filter({ hasText: '확인이 필요한 줄 2개' })
  await expect(issues).toContainText('4번째 줄: 연도는 1900~2100 사이 4자리 숫자여야 합니다.')
  await expect(issues).toContainText('5번째 줄: 칸이 부족합니다.')

  // 붙여넣은 내용을 고치면 미리보기가 사라져, 보지 않은 내용은 적용되지 않는다
  await panel.getByLabel('붙여넣을 내용').fill(paste + '\n')
  await expect(preview).toHaveCount(0)
  await panel.getByRole('button', { name: '미리보기' }).click()

  await panel.getByRole('button', { name: '3개 임기 적용' }).click()
  await expect(panel.getByRole('status').filter({ hasText: '일괄 등록을 마쳤습니다.' })).toBeVisible()
  expect(db.imports).toEqual([[
    { label: '52대', year: 2018, presidents: ['나다라'], vices: [] },
    { label: '53대', year: 2019, presidents: ['바사아'], vices: ['자차카', '타파하'] },
    { label: '초대', year: 1971, presidents: ['마바사'], vices: [] },
  ]])
  await expect(panel.getByLabel('붙여넣을 내용')).toHaveValue('')
  await expect(page.getByRole('article', { name: '53대 2019년' })).toContainText('타파하')
  await expect(page.getByRole('article', { name: '초대 1971년' })).toBeVisible()
})

test('an officer is linked to a roster row found by name, and 기수 appears on the chip', async ({ page }) => {
  const db = await installAdminApi(page)
  await page.goto('/admin?tab=club-officers')
  const term = page.getByRole('article', { name: '52대 2018년' })
  await term.getByRole('button', { name: '나다라 명부 연결' }).click()
  const picker = term.getByRole('group', { name: '나다라 명부 연결' })
  await picker.getByRole('searchbox').fill('가나다')
  await expect(picker.getByRole('list', { name: '명부 검색 결과' }).getByRole('listitem')).toHaveCount(2)
  await expect(picker).toContainText('50기 · 컴퓨터정보공학부')
  await expect(picker).not.toContainText('2020000001')
  await picker.getByRole('button', { name: '가나다 50기 연결' }).click()
  expect(db.links).toEqual([[21, 701]])
  await expect(term).toContainText('50기 · 명부 연결 (가나다)')
})

for (const width of [390, 320]) {
  test(`the admin tab fits a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await installAdminApi(page)
    await page.goto('/admin?tab=club-officers')
    await expect(page.getByRole('article', { name: '71대 2026년' })).toBeVisible()
    await page.getByLabel('붙여넣을 내용').fill('52대\t2018\t나다라\t')
    await page.getByRole('button', { name: '미리보기' }).click()
    await expect(page.getByRole('region', { name: '일괄 등록 미리보기' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
