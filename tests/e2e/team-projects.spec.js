import { expect, test } from '@playwright/test'
import { mockAdminApis } from './visualSupport.js'

test.use({ serviceWorkers: 'block' })

const pad = (value) => String(value).padStart(2, '0')
const localStamp = (date, time) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`
const inDays = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return date }

const PEOPLE = [
  { id: 1, studentId: '2020000001', name: '김하나', generation: '55', role: 'USER' },
  { id: 2, studentId: '2020000002', name: '이둘', generation: '56', role: 'USER' },
  { id: 3, studentId: '2020000003', name: '박셋', generation: '57', role: 'USER' },
]
const USERS = {
  admin: { id: 9, name: '회장', studentId: '2019000009', role: 'ADMIN', emailVerified: true },
  hana: { id: 1, name: '김하나', studentId: '2020000001', role: 'USER', emailVerified: true },
}

/** An in-memory stand-in for the team-project API, so the spec drives the real pages end to end. */
async function installFakeApi(page) {
  const db = { program: null, milestones: [], teams: [], members: [], submissions: [], next: 100, me: 'admin' }
  const id = () => db.next++
  const isAdmin = () => db.me === 'admin'
  const teamView = (team) => ({
    ...team,
    members: db.members.filter(m => m.teamId === team.id).map(m => {
      const person = PEOPLE.find(p => p.studentId === m.studentId)
      return { studentId: isAdmin() ? m.studentId : null, name: person.name, generation: person.generation }
    }),
  })
  const myTeam = () => db.teams.find(t => db.members.some(m => m.teamId === t.id && m.studentId === USERS[db.me].studentId))
  const summary = () => db.program && { ...db.program, myTeamId: myTeam()?.id ?? null, myTeamName: myTeam()?.name ?? null }
  const sorted = () => [...db.milestones].sort((a, b) => a.position - b.position)
  const submissionView = (s) => {
    const milestone = db.milestones.find(m => m.id === s.milestoneId)
    return { ...s, late: Boolean(milestone.dueAt && s.submittedAt > milestone.dueAt), editedAfterDue: Boolean(milestone.dueAt && s.updatedAt > milestone.dueAt) }
  }
  const field = (body, name) => new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body)?.[1] ?? ''
  const all = (body, name) => [...body.matchAll(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`, 'g'))].map(match => match[1])

  await page.route('**/api/auth/me', route => route.fulfill({ json: USERS[db.me] }))
  await page.route('**/api/admin/members', route => route.fulfill({ json: PEOPLE }))
  await page.route(/\/api\/(admin\/)?team-projects(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/admin/team-projects', '/api/team-projects').replace(/^\/api\/team-projects/, '')
    const method = request.method()
    const json = (body, status = 200) => route.fulfill({ status, json: body })
    let match
    if (method === 'GET' && path === '') return json(db.program ? [summary()] : [])
    if (method === 'POST' && path === '' ) { db.program = { id: 1, ...request.postDataJSON() }; return json(summary(), 201) }
    if (method === 'GET' && path === '/1') {
      return json({ ...db.program, milestones: sorted(), teams: db.teams.map(teamView), myTeamId: myTeam()?.id ?? null })
    }
    if (method === 'PUT' && path === '/1') { db.program = { ...db.program, ...request.postDataJSON() }; return json(summary()) }
    if (method === 'POST' && path === '/1/milestones') {
      const milestone = { id: id(), position: db.milestones.length, description: '', startsAt: null, dueAt: null, ...request.postDataJSON() }
      db.milestones.push(milestone)
      return json(milestone, 201)
    }
    if (method === 'PUT' && path === '/1/milestones/order') {
      request.postDataJSON().ids.forEach((milestoneId, index) => { db.milestones.find(m => m.id === milestoneId).position = index })
      return json(sorted())
    }
    if (method === 'POST' && path === '/1/teams') { const team = { id: id(), ...request.postDataJSON() }; db.teams.push(team); return json(teamView(team), 201) }
    if ((match = /^\/1\/teams\/(\d+)\/members$/.exec(path)) && method === 'POST') {
      const { studentId } = request.postDataJSON()
      if (db.members.some(m => m.studentId === studentId)) return json({ message: '이미 이 프로그램의 팀에 속한 회원입니다.' }, 409)
      db.members.push({ teamId: Number(match[1]), studentId })
      return json({ studentId, name: PEOPLE.find(p => p.studentId === studentId).name }, 201)
    }
    if (method === 'GET' && path === '/1/board') {
      const columns = sorted().filter(m => m.submittable)
      return json({
        milestones: columns,
        teams: db.teams.map(team => ({
          id: team.id, name: team.name, topic: team.topic, memberCount: db.members.filter(m => m.teamId === team.id).length,
          cells: columns.map(column => {
            const found = db.submissions.find(s => s.teamId === team.id && s.milestoneId === column.id)
            return { milestoneId: column.id, status: !found ? 'MISSING' : submissionView(found).late ? 'LATE' : 'SUBMITTED', submittedAt: found?.submittedAt ?? null, updatedAt: found?.updatedAt ?? null }
          }),
        })),
      })
    }
    if ((match = /^\/1\/teams\/(\d+)\/submissions$/.exec(path)) && method === 'GET') {
      return json(db.submissions.filter(s => s.teamId === Number(match[1])).map(submissionView))
    }
    if ((match = /^\/1\/teams\/(\d+)\/milestones\/(\d+)\/submission$/.exec(path)) && method === 'PUT') {
      const teamId = Number(match[1]); const milestoneId = Number(match[2])
      if (myTeam()?.id !== teamId) return json({}, 403)
      const raw = request.postDataBuffer().toString('latin1') + '\r\n--'
      const files = [...raw.matchAll(/name="files"; filename="([^"]*)"/g)].map(m => m[1])
      const now = localStamp(new Date(), `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}:00`)
      const previous = db.submissions.find(s => s.teamId === teamId && s.milestoneId === milestoneId)
      const saved = {
        id: previous?.id ?? id(), teamId, milestoneId, body: Buffer.from(field(raw, 'body'), 'latin1').toString('utf8'), links: all(raw, 'links'),
        files: [...(previous?.files ?? []), ...files.map(name => ({ id: id(), originalName: name, mimeType: 'application/octet-stream', fileSize: 12, downloadUrl: `/api/team-projects/1/teams/${teamId}/milestones/${milestoneId}/submission/files/${db.next}` }))],
        submittedByName: previous?.submittedByName ?? USERS[db.me].name, submittedAt: previous?.submittedAt ?? now, updatedByName: USERS[db.me].name, updatedAt: now,
      }
      db.submissions = [...db.submissions.filter(s => s !== previous), saved]
      return json(submissionView(saved))
    }
    return json({ message: `unmocked ${method} ${path}` }, 500)
  })
  return db
}

test('admin builds a program, a member submits text, a link and a file, and the status board shows it', async ({ page }) => {
  await mockAdminApis(page)
  const db = await installFakeApi(page)

  // ---- 회장: 팀프, 일정, 팀, 팀원
  await page.goto('/admin?tab=team-projects')
  await expect(page.getByText('아직 팀프가 없습니다')).toBeVisible()
  await page.getByRole('button', { name: '새 팀프 만들기' }).click()
  await page.getByRole('form', { name: '새 팀프 만들기' }).getByLabel('제목').fill('2026-2 팀 프로젝트')
  await page.getByRole('form', { name: '새 팀프 만들기' }).getByRole('button', { name: '만들기' }).click()
  await expect(page.getByRole('form', { name: '프로그램 정보' })).toBeVisible()

  const milestoneForm = page.getByRole('form', { name: '일정 추가' })
  const addMilestone = async (title, dueAt, submittable) => {
    await milestoneForm.getByLabel('일정 이름').fill(title)
    await milestoneForm.getByLabel('마감 또는 일시 (선택)').fill(dueAt)
    if (submittable) await milestoneForm.getByLabel('제출을 받는 일정').check()
    await milestoneForm.getByRole('button', { name: '일정 추가' }).click()
    await expect(page.getByRole('heading', { name: title, level: 4 })).toBeVisible()
  }
  await addMilestone('주제 선정', localStamp(inDays(3), '23:59'), true)
  await addMilestone('지난 과제', '2020-01-01T23:59', true)
  await addMilestone('최종 발표', '2099-12-28T18:00', false)
  await page.getByRole('button', { name: '최종 발표 위로' }).click()
  await expect.poll(() => db.milestones.find(m => m.title === '최종 발표').position).toBe(1)

  const teamForm = page.getByRole('form', { name: '새 팀 만들기' })
  await teamForm.getByLabel('팀 이름').fill('A팀')
  await teamForm.getByLabel('주제 (선택)').fill('동아리 출석 앱')
  await teamForm.getByRole('button', { name: '팀 만들기' }).click()
  const team = page.getByRole('article', { name: 'A팀 팀' })
  await team.getByLabel('A팀 팀원 검색').fill('55')
  await team.getByRole('button', { name: '김하나 A팀에 추가' }).click()
  await expect(team.getByText('김하나 55기 · 2020000001')).toBeVisible()
  await team.getByLabel('A팀 팀원 검색').fill('박셋')
  await expect(team.getByRole('button', { name: '박셋 A팀에 추가' })).toBeVisible()
  await team.getByLabel('A팀 팀원 검색').fill('김하나')
  await expect(team.getByText('A팀 소속')).toBeVisible()   // already on a team: no second add

  // ---- 회원: 일정·D-day, 제출
  db.me = 'hana'
  await page.goto('/team-projects')
  await page.getByRole('link', { name: /2026-2 팀 프로젝트/ }).click()
  await expect(page).toHaveURL(/\/team-projects\/1$/)
  const next = page.getByRole('region', { name: '다음 일정' })
  await expect(next).toContainText('주제 선정')
  await expect(next).toContainText('D-3')
  await expect(page.getByRole('heading', { name: '내 팀 · A팀' })).toBeVisible()
  await expect(page.getByText('동아리 출석 앱')).toBeVisible()

  const form = page.getByRole('form', { name: '주제 선정 제출' })
  await form.getByLabel('내용', { exact: true }).fill('출석 체크 앱을 만듭니다.')
  await form.getByLabel('링크 1', { exact: true }).fill('https://github.com/coms/attendance')
  await form.getByRole('button', { name: '링크 추가' }).click()
  await form.getByLabel('링크 2', { exact: true }).fill('https://example.com/figma')
  await form.getByLabel('파일 추가').setInputFiles({ name: 'topic.hwp', mimeType: 'application/x-hwp', buffer: Buffer.from('hwp-bytes') })
  const sent = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/submission'))
  await form.getByRole('button', { name: '제출하기' }).click()
  const body = (await sent).postDataBuffer().toString('latin1')
  expect(body).toContain('filename="topic.hwp"')
  expect(body).toContain('https://github.com/coms/attendance')
  expect(body).toContain('https://example.com/figma')
  const article = page.getByRole('article', { name: '주제 선정 제출' })
  await expect(article.getByText('출석 체크 앱을 만듭니다.')).toBeVisible()
  await expect(article.getByRole('link', { name: 'topic.hwp' })).toHaveAttribute('download', '')
  await expect(article.getByRole('link', { name: 'https://example.com/figma' })).toHaveAttribute('rel', /noopener/)
  await expect(article.getByText('제출', { exact: true })).toBeVisible()
  // 마감이 지난 일정에 내도 받아 주되 '늦은 제출'로 표시된다.
  await page.getByRole('form', { name: '지난 과제 제출' }).getByLabel('내용', { exact: true }).fill('늦었습니다')
  await page.getByRole('form', { name: '지난 과제 제출' }).getByRole('button', { name: '제출하기' }).click()
  await expect(page.getByRole('article', { name: '지난 과제 제출' }).getByText('늦은 제출', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  // ---- 회장: 제출 현황
  db.me = 'admin'
  await page.goto('/admin?tab=team-projects&program=1')
  const board = page.getByRole('region', { name: '팀별 제출 현황' })
  await expect(board.getByRole('button', { name: 'A팀 주제 선정 제출' })).toBeVisible()
  await expect(board.getByRole('button', { name: 'A팀 지난 과제 늦은 제출' })).toBeVisible()
  await board.getByRole('button', { name: 'A팀 주제 선정 제출' }).click()
  const opened = page.getByRole('article', { name: 'A팀 주제 선정 제출 내용' })
  await expect(opened).toContainText('출석 체크 앱을 만듭니다.')
  await expect(opened.getByRole('link', { name: 'topic.hwp' })).toBeVisible()
})

for (const width of [390, 320]) {
  test(`member page and admin board fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mockAdminApis(page)
    const db = await installFakeApi(page)
    db.program = { id: 1, title: '2026-2 팀 프로젝트', description: '한 학기 동안 팀별 결과물을 만듭니다.', open: true }
    db.milestones = [
      { id: 11, position: 0, title: '주제 선정', description: '팀별 프로젝트 주제 및 간단한 소개 제출', startsAt: null, dueAt: localStamp(inDays(1), '23:59:00'), submittable: true },
      { id: 12, position: 1, title: '시험·보강 기간', description: '의무 제출 없음', startsAt: localStamp(inDays(10), '00:00:00'), dueAt: localStamp(inDays(24), '00:00:00'), submittable: false },
    ]
    db.teams = [{ id: 21, name: '아주아주긴이름의팀프로젝트팀', topic: '긴 주제 '.repeat(12), intro: '' }]
    db.members = [{ teamId: 21, studentId: '2020000001' }]
    db.me = 'hana'
    await page.goto('/team-projects/1')
    await expect(page.getByRole('region', { name: '다음 일정' })).toContainText('D-1')
    await expect(page.getByRole('listitem').filter({ hasText: '시험·보강 기간' })).toContainText('제출 없음')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    db.me = 'admin'
    await page.goto('/admin?tab=team-projects&program=1')
    await expect(page.getByRole('region', { name: '팀별 제출 현황' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
