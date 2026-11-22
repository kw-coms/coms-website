import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'
import { legacyEvent, futureEvent, summary, adminSummary } from '../hackathonFixture.mjs'

test.use({ serviceWorkers: 'block' })

async function mockEvents(page, open = () => true) {
  await page.route('**/api/hackathon/events', route => route.fulfill({ json: [summary(legacyEvent), summary(futureEvent)] }))
  await page.route('**/api/hackathon/events/1', route => route.fulfill({ json: { ...legacyEvent, open: open(), status: open() ? 'REVIEWING' : 'DONE' } }))
  await page.route('**/api/hackathon/events/2', route => route.fulfill({ json: futureEvent }))
  await page.route('**/api/admin/hackathon/events', route => route.fulfill({ json: [adminSummary(legacyEvent), adminSummary(futureEvent)] }))
  await page.route('**/api/admin/hackathon/events/1', route => route.fulfill({ json: { ...legacyEvent, open: open(), status: open() ? 'REVIEWING' : 'DONE' } }))
}


for (const width of [320, 390, 1280]) {
  test(`alumni can evaluate and leave feedback without login at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockOptionalApis(page)
    await mockEvents(page)
    const submissions = []
    await page.route('**/api/hackathon/events/1/reviews', async (route) => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: { projectId: 'wargether' } })
    })
    await page.goto('/hackathon/1')
    await expect(page.getByRole('heading', { name: 'COM’s 해커톤 2026', exact: true })).toBeVisible()
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
    await expect(page.locator('#wargether button[type="submit"]')).toBeDisabled()
    // '42기'처럼 '기'를 붙여 적어도 숫자만 남아 그대로 제출된다.
    await page.getByLabel('기수', { exact: true }).fill('42기')
    await expect(page.getByLabel('기수', { exact: true })).toHaveValue('42')
    await page.getByLabel('이름', { exact: true }).fill('홍길동')
    const form = page.getByRole('form', { name: 'wargether 채점' })
    for (const select of await form.locator('select').all()) await select.selectOption('20')
    await form.locator('textarea').fill('좋은 연결 아이디어입니다.')
    await expect(form).toContainText('합계 100 / 100점')
    await form.getByRole('button', { name: '평가 제출', exact: true }).click()
    await expect(page.locator('#wargether')).toContainText('평가가 접수되었습니다')
    expect(submissions).toEqual([{ projectId: 'wargether', generation: 42, name: '홍길동', themeFit: 20, creativity: 20, technology: 20, completeness: 20, practicality: 20, feedback: '좋은 연결 아이디어입니다.' }])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('video[preload="none"]')).toHaveCount(3)
  })
}

test('duplicate errors preserve scores and a closed event disables submissions', async ({ page }) => {
  await mockOptionalApis(page)
  let open = true
  await mockEvents(page, () => open)
  await page.route('**/api/hackathon/events/1/reviews', (route) => route.fulfill({ status: 409, json: { message: '이 기수와 이름으로 이 팀의 평가를 이미 제출했습니다.' } }))
  await page.goto('/hackathon/1')
  await page.getByLabel('기수', { exact: true }).fill('42')
  await page.getByLabel('이름', { exact: true }).fill('홍길동')
  const form = page.getByRole('form', { name: 'wargether 채점' })
  for (const select of await form.locator('select').all()) await select.selectOption('0')
  await form.getByRole('button', { name: '평가 제출', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('이미 제출했습니다')
  await expect(form.locator('select').first()).toHaveValue('0')
  open = false
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: '평가가 마감되었습니다' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'wargether', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '평가 제출', exact: true })).toHaveCount(0)
  await expect(page.locator('form')).toHaveCount(0)
})

for (const width of [390, 1280]) {
  test(`chair confirms individual deletion and sees updated totals at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockAdminApis(page)
    const review = (id, name, score, chair = false) => ({
      id, name, chair, projectId: 'wargether', generation: chair ? null : 42,
      themeFit: score, creativity: score, technology: score, completeness: score, practicality: score,
      feedback: '평가 피드백', createdAt: '2026-11-18T12:00:00',
    })
    let reviews = [review(1, '남길평가', 10), review(2, '삭제대상', 20), review(3, '회장', 15, true)]
    let failDelete = true
    const deleted = []
    await mockEvents(page)
    await page.route('**/api/admin/hackathon/events/1/reviews', (route) => route.fulfill({ json: reviews }))
    await page.route('**/api/admin/hackathon/events/1/reviews/*', async (route) => {
      expect(route.request().method()).toBe('DELETE')
      const id = Number(route.request().url().split('/').at(-1))
      deleted.push(id)
      if (failDelete) return route.fulfill({ status: 500, json: { message: '삭제 실패' } })
      reviews = reviews.filter((item) => item.id !== id)
      return route.fulfill({ status: 204 })
    })
    await page.goto('/admin?tab=hackathon')
    const section = page.getByRole('region', { name: '해커톤 평가 관리' })
    const totals = section.locator('tbody tr').filter({ hasText: 'wargether' })
    await expect(totals.locator('td').nth(3)).toHaveText('75.00점')
    const project = section.locator('article').filter({ has: page.getByRole('heading', { name: 'wargether · 회장 평가', exact: true }) })
    await project.locator('summary').click()
    const remove = project.getByRole('button', { name: '42기 삭제대상 평가 삭제', exact: true })
    const dialog = page.getByRole('dialog', { name: '해커톤 평가 삭제' })
    await remove.click()
    await expect(dialog).toContainText('wargether의 42기 삭제대상')
    await expect(dialog).toContainText('복구할 수 없습니다')
    const accessibility = await new AxeBuilder({ page }).include('.coms-confirm-card').analyze()
    expect(accessibility.violations.map((violation) => violation.id)).toEqual([])
    await dialog.getByRole('button', { name: '취소', exact: true }).click()
    expect(deleted).toEqual([])
    await expect(remove).toBeVisible()
    await remove.click()
    await dialog.getByRole('button', { name: '평가 삭제', exact: true }).click()
    await expect(section.getByRole('alert')).toBeVisible()
    await expect(remove).toBeVisible()
    failDelete = false
    await remove.click()
    await dialog.getByRole('button', { name: '평가 삭제', exact: true }).click()
    await expect(remove).toHaveCount(0)
    await expect(totals.locator('td').nth(2)).toHaveText('1명')
    await expect(totals.locator('td').nth(3)).toHaveText('50.00점')
    await expect(totals.locator('td').nth(5)).toHaveText('62.50점')
    await expect(project.getByText('42기 남길평가', { exact: true })).toBeVisible()
    await project.getByRole('button', { name: 'wargether 회장 평가 삭제', exact: true }).click()
    await dialog.getByRole('button', { name: '평가 삭제', exact: true }).click()
    await expect(totals.locator('td').nth(4)).toHaveText('미집계')
    await expect(totals.locator('td').nth(5)).toHaveText('미집계')
    await expect(project.locator('form select').first()).toHaveValue('')
    expect(deleted).toEqual([2, 2, 3])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('events keep guest reviews and share links separate', async ({ page }) => {
  await mockOptionalApis(page)
  await mockEvents(page)
  const submissions = []
  await page.route('**/api/hackathon/events/*/reviews', route => {
    submissions.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() })
    return route.fulfill({ status: 201, json: { projectId: route.request().postDataJSON().projectId } })
  })
  await page.goto('/hackathon/2')
  await expect(page.getByRole('heading', { name: '2027년 1학기 해커톤', exact: true })).toBeVisible()
  await expect(page.getByText('2027년 1학기', { exact: true })).toBeVisible()
  await expect(page).toHaveTitle(/2027년 1학기 해커톤/)
  await expect(page.getByRole('link', { name: '← 해커톤 아카이브' })).toHaveAttribute('href', '/hackathon')
  await expect(page.locator('#wargether')).toHaveCount(0)
  await page.getByLabel('기수', { exact: true }).fill('42')
  await page.getByLabel('이름', { exact: true }).fill('테스트사용자')
  const futureForm = page.getByRole('form', { name: 'future-team 채점' })
  for (const select of await futureForm.locator('select').all()) await select.selectOption('15')
  await futureForm.getByRole('button', { name: '평가 제출' }).click()
  await expect(page.locator('#future-team')).toContainText('평가가 접수되었습니다')
  await page.getByRole('link', { name: '← 해커톤 아카이브' }).click()
  await page.getByRole('link', { name: /COM’s 해커톤 2026/ }).first().click()
  await expect(page.getByRole('heading', { name: 'COM’s 해커톤 2026', exact: true, level: 1 })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('#wargether form')).toBeVisible()
  expect(submissions).toEqual([{ path: '/api/hackathon/events/2/reviews', body: { projectId: 'future-team', generation: 42, name: '테스트사용자', themeFit: 15, creativity: 15, technology: 15, completeness: 15, practicality: 15, feedback: '' } }])
  const shared = []
  await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.__hackathonCopied = text } })
  await page.getByRole('link', { name: '← 해커톤 아카이브' }).click()
  await page.getByRole('link', { name: /2027년 1학기 해커톤/ }).first().click()
  await page.getByRole('button', { name: '평가 링크 복사' }).click()
  shared.push(await page.evaluate(() => window.__hackathonCopied))
  expect(shared).toEqual([`${new URL(page.url()).origin}/hackathon/2/share`])
})

test('unknown or unpublished event shows no private draft or 2026 fallback', async ({ page }) => {
  await mockOptionalApis(page)
  await page.route('**/api/hackathon/events', route => route.fulfill({ json: [summary(legacyEvent)] }))
  await page.route('**/api/hackathon/events/9', route => route.fulfill({ status: 404, json: { message: 'not found' } }))
  await page.goto('/hackathon/9')
  await expect(page.getByRole('alert')).toContainText('해커톤을 찾을 수 없습니다.')
  await expect(page.locator('#wargether')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '비공개 행사', exact: true })).toHaveCount(0)
})

for (const width of [320, 390, 1280]) test(`chair can publish an announcement before teams at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await mockAdminApis(page)
  let events = [{ ...legacyEvent }, { ...futureEvent, published: false, open: false, projects: [] }]
  const calls = []
  await page.route('**/api/admin/hackathon/events', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: events.map(adminSummary) })
    const body = route.request().postDataJSON()
    calls.push({ method: 'POST', body })
    const created = { ...body, id: 3, published: false, open: false, status: 'DONE', resultsPublished: false, projects: [], materials: [] }
    events = [...events, created]
    return route.fulfill({ status: 201, json: created })
  })
  await page.route(/\/api\/admin\/hackathon\/events\/\d+(?:\/.*)?$/, route => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const id = Number(parts[5])
    const event = events.find(item => item.id === id)
    if (parts[6] === 'reviews') return route.fulfill({ json: [] })
    if (parts[8] === 'members') return route.fulfill({ json: [] })
    if (parts[6] === 'published' && route.request().method() === 'PUT') {
      event.published = route.request().postDataJSON().published
      calls.push({ method: 'PUT published', id, published: event.published })
      return route.fulfill({ json: { published: event.published } })
    }
    if (parts[6] === 'settings' && route.request().method() === 'PUT') return route.fulfill({ status: 409, json: { message: '팀이 없으면 평가를 열 수 없습니다.' } })
    if (parts[6] === 'projects' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const project = { ...body, projectId: 'new-project', position: event.projects.length, materials: [] }
      event.projects.push(project)
      calls.push({ method: 'POST project', id, body })
      return route.fulfill({ status: 201, json: project })
    }
    if (parts[6] === 'materials' && route.request().method() === 'POST') {
      const material = { id: 201, projectId: null, kind: 'presentation', label: '발표 자료', originalName: 'slides.pdf', mimeType: 'application/pdf', fileSize: 17, url: '/api/hackathon/events/3/materials/201/inline.pdf' }
      event.materials.push(material)
      calls.push({ method: 'POST material', id, body: route.request().postData() })
      return route.fulfill({ status: 201, json: material })
    }
    return event ? route.fulfill({ json: event }) : route.fulfill({ status: 404, json: { message: 'not found' } })
  })
  await page.goto('/admin?tab=hackathon&event=2')
  const section = page.getByRole('region', { name: '해커톤 평가 관리' })
  await expect(section.getByText('초안 · 평가 마감')).toBeVisible()
  await expect(section.getByRole('button', { name: '평가 다시 열기' })).toBeDisabled()
  await section.getByRole('button', { name: '글 공개' }).click()
  await expect(section.getByText('공개 중 · 평가 마감')).toBeVisible()
  expect(calls).toContainEqual({ method: 'PUT published', id: 2, published: true })
  await section.getByRole('button', { name: '새 해커톤 작성' }).click()
  const editor = section.getByRole('form', { name: '새 해커톤 작성' })
  await editor.getByLabel('해커톤 이름').fill('2028년 2학기 해커톤')
  await editor.getByLabel('연도').fill('2028')
  await editor.getByLabel('학기').selectOption('2')
  await editor.getByLabel('소개').fill('새 공지')
  await editor.getByRole('button', { name: '초안 만들기' }).click()
  await expect(page).toHaveURL(/event=3/)
  expect(calls.find(call => call.method === 'POST').body).toMatchObject({ title: '2028년 2학기 해커톤', year: 2028, semester: 2, introduction: '새 공지' })
  await section.locator('summary').getByText('새 팀 등록', { exact: true }).click()
  const projectEditor = section.getByRole('form', { name: '새 팀 등록' })
  await projectEditor.getByLabel('팀 이름').fill('테스트 팀')
  await projectEditor.getByLabel('작품 이름').fill('새 작품')
  await projectEditor.getByLabel('작성자').fill('작성자 이름')
  await projectEditor.getByLabel('작품 공개').check()
  await projectEditor.getByLabel('작품 소개').fill('새 학기의 작품 소개')
  await projectEditor.getByRole('button', { name: '팀 추가' }).click()
  await expect(section.getByRole('heading', { name: '테스트 팀', exact: true })).toBeVisible()
  expect(calls.find(call => call.method === 'POST project').body).toMatchObject({ teamName: '테스트 팀', title: '새 작품', author: '작성자 이름', description: '새 학기의 작품 소개', published: true })
  const upload = section.getByRole('form', { name: '행사 자료 올리기' })
  await upload.getByLabel('자료 파일').setInputFiles({ name: 'slides.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test file') })
  await upload.getByLabel('자료 종류').selectOption('presentation')
  await upload.getByLabel('표시 이름').fill('발표 자료')
  await upload.getByRole('button', { name: '자료 올리기' }).click()
  await expect(section.getByRole('status').filter({ hasText: '행사 자료를 올렸습니다.' })).toBeVisible()
  await expect(section.getByRole('button', { name: '행사 자료 삭제' })).toHaveCount(0)
  await expect(section.getByRole('button', { name: '삭제', exact: true })).toHaveCount(1)
  expect(calls.find(call => call.method === 'POST material').body).toContain('name="kind"')
  await section.getByRole('button', { name: '글 공개' }).click()
  await expect(section.getByText('공개 중 · 평가 마감')).toBeVisible()
  await expect(section.getByRole('button', { name: '평가 다시 열기' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="해커톤 평가 관리"]').analyze()
  expect(accessibility.violations.map(violation => violation.id)).toEqual([])
})

test('switching cached events clears unsaved team, material and chair drafts', async ({ page }) => {
  await mockAdminApis(page)
  const first = { ...legacyEvent, open: false, status: 'DONE' }
  const second = { ...futureEvent, open: false, status: 'DONE' }
  const writes = []
  await page.route('**/api/admin/hackathon/events', route => route.fulfill({ json: [adminSummary(first), adminSummary(second)] }))
  await page.route(/\/api\/admin\/hackathon\/events\/\d+(?:\/.*)?$/, route => {
    if (route.request().method() !== 'GET') writes.push(route.request().url())
    const id = Number(new URL(route.request().url()).pathname.split('/')[5])
    if (['reviews', 'members'].some(value => new URL(route.request().url()).pathname.endsWith('/' + value))) return route.fulfill({ json: [] })
    return route.fulfill({ json: id === 1 ? first : second })
  })
  await page.goto('/admin?tab=hackathon&event=1')
  const section = page.getByRole('region', { name: '해커톤 평가 관리' })
  const select = section.getByRole('combobox', { name: '관리할 해커톤' })
  await expect(section.getByRole('heading', { name: 'wargether', exact: true })).toBeVisible()
  await select.selectOption('2')
  await expect(section.getByRole('form', { name: 'future-team 채점' })).toBeVisible()
  await select.selectOption('1')
  await expect(section.getByRole('heading', { name: 'wargether', exact: true })).toBeVisible()
  await section.locator('summary').getByText('새 팀 등록', { exact: true }).click()
  const teamDraft = section.getByRole('form', { name: '새 팀 등록' })
  await teamDraft.getByLabel('작품 이름').fill('EVENT_A_UNSAVED_TEAM')
  await teamDraft.getByLabel('작성자').fill('작성 중')
  await teamDraft.getByLabel('작품 소개').fill('이 행사의 초안')
  const materialDraft = section.getByRole('form', { name: '행사 자료 올리기' })
  await materialDraft.getByLabel('자료 파일').setInputFiles({ name: 'event-a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 event a') })
  await materialDraft.getByLabel('자료 종류').selectOption('presentation')
  await materialDraft.getByLabel('표시 이름').fill('EVENT_A_FILE_LABEL')
  await section.getByRole('form', { name: 'chair-wargether 채점' }).locator('select').first().selectOption('19')
  await select.selectOption('2')
  await expect(section.getByRole('form', { name: 'future-team 채점' })).toBeVisible()
  await section.locator('summary').getByText('새 팀 등록', { exact: true }).click()
  await expect(section.getByRole('form', { name: '새 팀 등록' }).getByLabel('작품 이름')).toHaveValue('')
  const otherMaterial = section.getByRole('form', { name: '행사 자료 올리기' })
  await expect(otherMaterial.getByLabel('자료 파일')).toHaveJSProperty('value', '')
  await expect(otherMaterial.getByLabel('자료 종류')).toHaveValue('other')
  await expect(otherMaterial.getByLabel('표시 이름')).toHaveValue('')
  await expect(section.getByRole('form', { name: 'chair-future-team 채점' }).locator('select').first()).toHaveValue('')
  expect(writes).toEqual([])
})
