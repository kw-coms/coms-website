import { readFileSync } from 'node:fs'
import { expect, request as apiRequest, test } from '@playwright/test'

const FRONTEND = process.env.E2E_STACK_URL || 'http://127.0.0.1:3000'
const BACKEND = process.env.E2E_STACK_BACKEND || 'http://127.0.0.1:8080'
const ADMIN = { identifier: process.env.E2E_STACK_ADMIN_ID, password: process.env.E2E_STACK_ADMIN_PASSWORD }
const enabled = process.env.E2E_STACK === '1'

// This scenario creates votes. A non-loopback target must fail before any request is sent.
if (enabled) {
  for (const address of [FRONTEND, BACKEND]) {
    const url = new URL(address)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Hackathon stack acceptance requires loopback frontend and backend URLs')
    }
  }
}

test.skip(!enabled, 'requires the isolated production-image stack')
test.use({ channel: 'chromium', serviceWorkers: 'block' })

test('preserves the 2026 event and its legacy API response', async ({ request }) => {
  const status = await request.get(`${BACKEND}/api/hackathon`)
  expect(status.status()).toBe(200)
  expect(Object.keys(await status.json())).toEqual(['open'])
  const legacy = await request.get(`${BACKEND}/api/hackathon/events/1`)
  expect(legacy.status()).toBe(200)
  const event = await legacy.json()
  expect(event.projects.map(project => project.projectId).sort()).toEqual(['still', 'underground-route', 'wargether'])
  expect(event.materials.some(material => material.url === '/hackathon-2026/opening.pptx')).toBe(true)
})

test('isolates chair-authored events, materials and alumni evaluations on the real stack', async ({ browser, context, request }) => {
  test.setTimeout(120_000)
  expect(ADMIN.identifier && ADMIN.password, 'the stack bootstrap admin must be available').toBeTruthy()
  const login = await request.post(`${BACKEND}/api/auth/login`, {
    headers: { Origin: 'https://coms.kw.ac.kr' },
    data: { identifier: ADMIN.identifier, password: ADMIN.password, rememberMe: false },
  })
  expect(login.status()).toBe(200)
  const cookies = login.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => header.value.split(';')[0])
    .map(pair => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: FRONTEND }))
  expect(cookies.map(cookie => cookie.name)).toContain('token')
  await context.addCookies(cookies)
  await context.route(url => url.origin === new URL(FRONTEND).origin && url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url())
    return route.continue({ url: `${BACKEND}${url.pathname}${url.search}` })
  })

  const guest = await apiRequest.newContext()
  const guestBrowser = await browser.newContext({ baseURL: FRONTEND, serviceWorkers: 'block' })
  await guestBrowser.route(url => url.origin === new URL(FRONTEND).origin && url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url())
    return route.continue({ url: `${BACKEND}${url.pathname}${url.search}` })
  })
  const adminPath = '/api/admin/hackathon/events'
  const scores = { themeFit: 12, creativity: 13, technology: 14, completeness: 15, practicality: 16, feedback: '격리 검증용 피드백' }
  const identity = { generation: 42, name: '검증용 평가자' }
  const write = (method, path, data) => request[method](`${BACKEND}${path}`, { headers: { Origin: 'https://coms.kw.ac.kr' }, data })
  try {
    await test.step('a draft stays private and an announcement publishes before teams arrive', async () => {
      const denied = await guest.get(`${BACKEND}${adminPath}`)
      expect([401, 403]).toContain(denied.status())
    })
    const firstCreate = await write('post', adminPath, { title: '2027년 1학기 검증 해커톤', year: 2027, semester: 1, theme: '연결', introduction: '첫 행사\n함께 만드는 작품', rules: '항목별 20점\n팀별 한 번 평가' })
    const secondCreate = await write('post', adminPath, { title: '2028년 2학기 검증 해커톤', year: 2028, semester: 2, theme: '협력', introduction: '둘째 행사', rules: '항목별 20점' })
    expect(firstCreate.status()).toBe(201)
    expect(secondCreate.status()).toBe(201)
    const first = await firstCreate.json()
    const second = await secondCreate.json()
    expect(first.id).not.toBe(second.id)
    expect((await guest.get(`${BACKEND}/api/hackathon/events/${second.id}`)).status()).toBe(404)
    expect((await write('put', `${adminPath}/${first.id}/published`, { published: true })).status()).toBe(200)
    const published = await guest.get(`${BACKEND}/api/hackathon/events`)
    const publishedIds = (await published.json()).map(event => event.id)
    expect(publishedIds).toContain(first.id)
    expect(publishedIds).not.toContain(second.id)
    const announcement = await guest.get(`${BACKEND}/api/hackathon/events/${first.id}`)
    expect(announcement.status()).toBe(200)
    expect((await announcement.json()).projects).toEqual([])
    expect((await announcement.json()).introduction).toContain('\n')
    expect((await write('put', `${adminPath}/${first.id}/settings`, { open: true })).status()).toBe(409)

    const projectA = await write('post', `${adminPath}/${first.id}/projects`, { title: '첫 작품', author: '검증 팀 A', description: '재난 상황의 연결을 돕는 작품\n오프라인에서도 동작합니다.' })
    const projectB = await write('post', `${adminPath}/${second.id}/projects`, { title: '둘째 작품', author: '검증 팀 B', description: '협력 상황을 돕는 작품' })
    expect(projectA.status()).toBe(201)
    expect(projectB.status()).toBe(201)
    const projectIdA = (await projectA.json()).projectId
    const projectIdB = (await projectB.json()).projectId
    expect(typeof projectIdA).toBe('string')
    expect(projectIdA).not.toBe(projectIdB)

    const pdf = readFileSync(new URL('../../public/hackathon-2026/still/proposal.pdf', import.meta.url))
    const pptx = readFileSync(new URL('../../public/hackathon-2026/opening.pptx', import.meta.url))
    const pdfUpload = await request.post(`${BACKEND}${adminPath}/${first.id}/materials`, {
      headers: { Origin: 'https://coms.kw.ac.kr' },
      multipart: { file: { name: 'proposal.pdf', mimeType: 'application/pdf', buffer: pdf }, projectId: projectIdA, kind: 'proposal', label: '계획서' },
    })
    const pptxUpload = await request.post(`${BACKEND}${adminPath}/${first.id}/materials`, {
      headers: { Origin: 'https://coms.kw.ac.kr' },
      multipart: { file: { name: 'opening.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx }, kind: 'presentation', label: '개회식' },
    })
    expect(pdfUpload.status()).toBe(201)
    expect(pptxUpload.status()).toBe(201)
    const pdfMaterial = await pdfUpload.json()
    const pptxMaterial = await pptxUpload.json()
    expect((await guest.get(`${BACKEND}/api/hackathon/events/${second.id}/materials/${pdfMaterial.id}`)).status()).toBe(404)
    expect((await guest.get(`${BACKEND}/api/hackathon/events/${first.id}/materials/${pptxMaterial.id}/inline.pdf`)).status()).toBe(404)

    expect((await write('put', `${adminPath}/${second.id}/published`, { published: true })).status()).toBe(200)
    for (const event of [first, second]) expect((await write('put', `${adminPath}/${event.id}/settings`, { open: true })).status()).toBe(200)
    for (const event of [first, second]) expect((await write('put', `${adminPath}/${event.id}/guest-reviews`, { allowGuestReviews: true })).status()).toBe(200)
    const pdfResponse = await guest.get(`${BACKEND}/api/hackathon/events/${first.id}/materials/${pdfMaterial.id}/inline.pdf`)
    expect(pdfResponse.status()).toBe(200)
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf')
    expect(pdfResponse.headers()['content-security-policy']).toBeUndefined()
    expect(pdfResponse.headers()['x-content-type-options']).toBe('nosniff')
    expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe('%PDF-')
    const pptxResponse = await guest.get(`${BACKEND}/api/hackathon/events/${first.id}/materials/${pptxMaterial.id}`)
    expect(pptxResponse.status()).toBe(200)
    expect(pptxResponse.headers()['content-disposition']).toContain('attachment')
    expect(await pptxResponse.body()).toEqual(pptx)

    const guestPage = await guestBrowser.newPage()
    await guestPage.goto(`/hackathon/${first.id}`)
    await expect(guestPage.getByRole('heading', { name: first.title, level: 1 })).toBeVisible()
    await expect(guestPage.getByRole('heading', { name: '첫 작품' })).toBeVisible()
    await guestPage.goto(`/hackathon/${second.id}`)
    await expect(guestPage.getByRole('heading', { name: second.title, level: 1 })).toBeVisible()
    await expect(guestPage.getByRole('heading', { name: '둘째 작품' })).toBeVisible()

    const reviewA = { ...identity, ...scores, projectId: projectIdA }
    const reviewB = { ...identity, ...scores, projectId: projectIdB }
    const submit = (eventId, payload) => guest.post(`${BACKEND}/api/hackathon/events/${eventId}/reviews`, {
      headers: { Origin: 'https://coms.kw.ac.kr' }, data: payload,
    })
    expect((await submit(first.id, reviewA)).status()).toBe(201)
    expect((await submit(second.id, reviewB)).status()).toBe(201)
    expect((await submit(first.id, reviewA)).status()).toBe(409)
    expect((await submit(second.id, reviewA)).status()).toBe(404)
    const reviewsA = await request.get(`${BACKEND}${adminPath}/${first.id}/reviews`)
    const reviewsB = await request.get(`${BACKEND}${adminPath}/${second.id}/reviews`)
    expect((await reviewsA.json()).map(review => review.projectId)).toEqual([projectIdA])
    expect((await reviewsB.json()).map(review => review.projectId)).toEqual([projectIdB])
    expect([401, 403]).toContain((await guest.get(`${BACKEND}${adminPath}/${first.id}/reviews`)).status())
    expect((await write('put', `${adminPath}/${first.id}/published`, { published: false })).status()).toBe(409)
    expect((await write('put', `${adminPath}/${first.id}/settings`, { open: false })).status()).toBe(200)
    expect((await submit(first.id, { ...reviewA, name: '다른 평가자' })).status()).toBe(409)
    expect((await write('put', `${adminPath}/${first.id}/published`, { published: false })).status()).toBe(409)
    expect((await write('put', `${adminPath}/${first.id}/chair-reviews/${projectIdA}`, scores)).status()).toBe(200)
  } finally {
    await guest.dispose()
    await guestBrowser.close()
  }
})
