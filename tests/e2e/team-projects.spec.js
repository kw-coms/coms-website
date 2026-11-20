import { expect, test } from '@playwright/test'
import { mockAdminApis } from './visualSupport.js'

test.use({ serviceWorkers: 'block' })

// Korea wall-clock strings, like the API's, whatever zone the test machine is in.
const seoulWall = (offsetDays = 0) => new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 19)
const stamp = (days, time) => `${seoulWall(days).slice(0, 10)}T${time}`

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
  const db = { program: null, milestones: [], teams: [], members: [], submissions: [], next: 100, me: 'admin', limits: { maxFileBytes: 5 * 1024 * 1024, maxRequestBytes: 8 * 1024 * 1024 } }
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
  // An all-day due date runs to 23:59:59 of that day, like the server.
  const dueOf = (m) => m.dueAt && (m.allDay ? `${m.dueAt.slice(0, 10)}T23:59:59` : m.dueAt)
  const submissionView = (s) => {
    const milestone = db.milestones.find(m => m.id === s.milestoneId)
    const due = dueOf(milestone)
    return { ...s, late: Boolean(due && s.submittedAt > due), editedAfterDue: Boolean(due && s.updatedAt > due) }
  }
  const normalize = (write) => write.allDay
    ? { ...write, startsAt: write.startsAt && `${write.startsAt.slice(0, 10)}T00:00:00`, dueAt: write.dueAt && `${write.dueAt.slice(0, 10)}T00:00:00` }
    : write
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
      return json({ ...db.program, ...db.limits, milestones: sorted(), teams: db.teams.map(teamView), myTeamId: myTeam()?.id ?? null })
    }
    if (method === 'PUT' && path === '/1') { db.program = { ...db.program, ...request.postDataJSON() }; return json(summary()) }
    if (method === 'POST' && path === '/1/milestones') {
      const milestone = { id: id(), position: db.milestones.length, description: '', startsAt: null, dueAt: null, allDay: false, ...normalize(request.postDataJSON()) }
      db.milestones.push(milestone)
      return json(milestone, 201)
    }
    if ((match = /^\/1\/milestones\/(\d+)$/.exec(path)) && method === 'PUT') {
      const milestone = db.milestones.find(m => m.id === Number(match[1]))
      Object.assign(milestone, normalize(request.postDataJSON()))
      return json(milestone)
    }
    if (method === 'PUT' && path === '/1/milestones/order') {
      request.postDataJSON().ids.forEach((milestoneId, index) => { db.milestones.find(m => m.id === milestoneId).position = index })
      return json(sorted())
    }
    if (method === 'POST' && path === '/1/teams' && db.teams.some(t => t.name === request.postDataJSON().name)) return json({ message: '같은 이름의 팀이 이미 있습니다.' }, 409)
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
            return { milestoneId: column.id, status: !found ? 'MISSING' : submissionView(found).late ? 'LATE' : 'SUBMITTED', submittedAt: found?.submittedAt ?? null, updatedAt: found?.updatedAt ?? null, editedAfterDue: found ? submissionView(found).editedAfterDue : false }
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
      if (db.uploadStatus) return route.fulfill({ status: db.uploadStatus, contentType: 'text/html', body: '<h1>413 Request Entity Too Large</h1>' })
      if (db.uploadDelay) await new Promise(resolve => setTimeout(resolve, db.uploadDelay))
      const now = seoulWall()
      const previous = db.submissions.find(s => s.teamId === teamId && s.milestoneId === milestoneId)
      const saved = {
        id: previous?.id ?? id(), teamId, milestoneId, body: Buffer.from(field(raw, 'body'), 'latin1').toString('utf8'), links: all(raw, 'links'),
        files: [...(previous?.files ?? []).filter(file => !all(raw, 'removeFileIds').includes(String(file.id))), ...files.map(name => ({ id: id(), originalName: name, mimeType: 'application/octet-stream', fileSize: 12, downloadUrl: `/api/team-projects/1/teams/${teamId}/milestones/${milestoneId}/submission/files/${db.next}` }))],
        submittedByName: previous?.submittedByName ?? USERS[db.me].name, submittedAt: previous?.submittedAt ?? now, updatedByName: USERS[db.me].name, updatedAt: now,
      }
      db.submissions = [...db.submissions.filter(s => s !== previous), saved]
      return json(submissionView(saved))
    }
    return json({ message: `unmocked ${method} ${path}` }, 500)
  })
  return db
}

test('admin builds a program with every kind of schedule item, a member submits, and the status board shows it', async ({ page }) => {
  await mockAdminApis(page)
  const db = await installFakeApi(page)

  // ---- 회장: 팀프, 일정(제출 마감·종일·일정·기간), 팀, 팀원
  await page.goto('/admin?tab=team-projects')
  await expect(page.getByText('아직 팀프가 없습니다')).toBeVisible()
  await page.getByRole('button', { name: '새 팀프 만들기' }).click()
  await page.getByRole('form', { name: '새 팀프 만들기' }).getByLabel('제목').fill('2026-2 팀 프로젝트')
  await page.getByRole('form', { name: '새 팀프 만들기' }).getByRole('button', { name: '만들기' }).click()
  await expect(page.getByRole('form', { name: '프로그램 정보' })).toBeVisible()

  const milestoneForm = page.getByRole('form', { name: '일정 추가' })
  const finish = async (title) => {
    await milestoneForm.getByRole('button', { name: '일정 추가' }).click()
    await expect(page.getByRole('heading', { name: title, level: 4 })).toBeVisible()
  }
  await milestoneForm.getByLabel('일정 이름').fill('주제 선정')
  await milestoneForm.getByLabel('마감 (선택)').fill(stamp(3, '23:59'))
  await finish('주제 선정')
  await milestoneForm.getByLabel('일정 이름').fill('지난 과제')
  await milestoneForm.getByLabel('마감 (선택)').fill('2020-01-01T23:59')
  await finish('지난 과제')

  // 일정·행사: 종일(날짜만)
  await milestoneForm.getByText('일정·행사', { exact: true }).click()
  await expect(milestoneForm.getByText('예: 최종 발표 18:00')).toBeVisible()
  await milestoneForm.getByLabel('일정 이름').fill('중간 점검')
  await milestoneForm.getByLabel('시간 없음 (종일)').check()
  await milestoneForm.getByLabel('일시 (선택)').fill('2099-12-06')
  await finish('중간 점검')
  expect(db.milestones.find(m => m.title === '중간 점검')).toMatchObject({ allDay: true, submittable: false, dueAt: '2099-12-06T00:00:00' })

  // 기간: 시작·종료, 잘못된 범위는 입력칸 옆에 바로 알려 준다
  await milestoneForm.getByText('기간', { exact: true }).click()
  await milestoneForm.getByLabel('일정 이름').fill('시험·보강 기간')
  await milestoneForm.getByLabel('시간 없음 (종일)').check()
  await milestoneForm.getByLabel('시작', { exact: true }).fill('2099-12-21')
  await milestoneForm.getByLabel('종료', { exact: true }).fill('2099-12-08')
  await expect(milestoneForm.getByRole('alert')).toContainText('종료(마감)는 시작보다 빠를 수 없습니다')
  await expect(milestoneForm.getByRole('button', { name: '일정 추가' })).toBeDisabled()
  await milestoneForm.getByLabel('시작', { exact: true }).fill('2099-12-08')
  await milestoneForm.getByLabel('종료', { exact: true }).fill('2099-12-21')
  await expect(milestoneForm.getByRole('alert')).toHaveCount(0)
  await finish('시험·보강 기간')
  expect(db.milestones.find(m => m.title === '시험·보강 기간')).toMatchObject({ allDay: true, startsAt: '2099-12-08T00:00:00', dueAt: '2099-12-21T00:00:00' })

  // 일정·행사: 시각 있음
  await milestoneForm.getByText('일정·행사', { exact: true }).click()
  await milestoneForm.getByLabel('일정 이름').fill('최종 발표')
  await milestoneForm.getByLabel('일시 (선택)').fill('2099-12-28T18:00')
  await finish('최종 발표')
  await page.getByRole('button', { name: '최종 발표 위로' }).click()
  await expect.poll(() => db.milestones.find(m => m.title === '최종 발표').position).toBe(3)

  // 일정 수정: 종일을 풀면 시각 입력으로 바뀌고 저장된다
  await page.getByRole('button', { name: '중간 점검 편집' }).click()
  const edit = page.getByRole('form', { name: '중간 점검 일정 편집' })
  await expect(edit.getByLabel('일시 (선택)')).toHaveAttribute('type', 'date')
  await edit.getByLabel('시간 없음 (종일)').uncheck()
  await expect(edit.getByLabel('일시 (선택)')).toHaveAttribute('type', 'datetime-local')
  await edit.getByLabel('일시 (선택)').fill('2099-12-06T14:30')
  await edit.getByLabel('설명').fill('GitHub 저장소와 초기 개발 현황 공유')
  await edit.getByRole('button', { name: '일정 저장' }).click()
  await expect(page.getByText('GitHub 저장소와 초기 개발 현황 공유')).toBeVisible()
  expect(db.milestones.find(m => m.title === '중간 점검')).toMatchObject({ allDay: false, dueAt: '2099-12-06T14:30' })

  // 팀·팀원, 서버 오류는 그 폼 안에 보인다
  const teamForm = page.getByRole('form', { name: '새 팀 만들기' })
  await teamForm.getByLabel('팀 이름').fill('A팀')
  await teamForm.getByLabel('주제 (선택)').fill('동아리 출석 앱')
  await teamForm.getByRole('button', { name: '팀 만들기' }).click()
  await expect(page.getByRole('article', { name: 'A팀 팀' })).toBeVisible()
  await teamForm.getByLabel('팀 이름').fill('A팀')
  await teamForm.getByRole('button', { name: '팀 만들기' }).click()
  await expect(teamForm.getByRole('alert')).toContainText('같은 이름의 팀이 이미 있습니다')
  const team = page.getByRole('article', { name: 'A팀 팀' })
  await team.getByLabel('A팀 팀원 검색').fill('55')
  await team.getByRole('button', { name: '김하나 A팀에 추가' }).click()
  await expect(team.getByText('김하나 55기 · 2020000001')).toBeVisible()
  await team.getByLabel('A팀 팀원 검색').fill('김하나')
  await expect(team.getByText('A팀 소속')).toBeVisible()   // already on a team: no second add

  // ---- 회원: 메뉴로 들어가기, 일정·D-day, 제출 전/미제출
  db.me = 'hana'
  await page.goto('/about')
  await page.locator('header nav.nav-groups').getByRole('button', { name: '멤버', exact: true }).click()
  await page.locator('#nav-panel').getByRole('button', { name: /^팀 프로젝트/ }).click()
  await expect(page).toHaveURL(/\/team-projects$/)
  await page.getByRole('link', { name: /2026-2 팀 프로젝트/ }).click()
  await expect(page).toHaveURL(/\/team-projects\/1$/)
  const next = page.getByRole('region', { name: '다음 일정' })
  await expect(next).toContainText('주제 선정')
  await expect(next).toContainText('D-3')
  const timeline = page.getByRole('list', { name: '일정' })
  await expect(timeline.getByRole('listitem').filter({ hasText: '주제 선정' })).toContainText('제출 전')
  await expect(timeline.getByRole('listitem').filter({ hasText: '지난 과제' })).toContainText('미제출')
  await expect(timeline.getByRole('listitem').filter({ hasText: '시험·보강 기간' })).toContainText('시작 D-')
  await expect(timeline.getByRole('listitem').filter({ hasText: '시험·보강 기간' })).toContainText('12/8(')
  await expect(page.getByRole('heading', { name: '내 팀 · A팀' })).toBeVisible()
  await expect(page.getByText('동아리 출석 앱')).toBeVisible()

  // ---- 제출: 본문 + 링크 2개 + 파일, 같은 파일은 한 번만, 너무 큰 파일은 고르는 즉시 거절
  const form = page.getByRole('form', { name: '주제 선정 제출' })
  await form.getByLabel('내용', { exact: true }).fill('출석 체크 앱을 만듭니다.')
  await form.getByLabel('링크 1', { exact: true }).fill('https://github.com/coms/attendance')
  await form.getByRole('button', { name: '링크 추가' }).click()
  await form.getByLabel('링크 2', { exact: true }).fill('https://example.com/figma')
  const hwp = { name: 'topic.hwp', mimeType: 'application/x-hwp', buffer: Buffer.from('hwp-bytes') }
  await form.getByLabel('파일 추가').setInputFiles(hwp)
  // The same file (name, size, modified time) picked twice is kept once.
  const pickSame = () => form.getByLabel('파일 추가').evaluate((input) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['same'], 'dup.txt', { lastModified: 1_000 }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await pickSame()
  await pickSame()
  await expect(form.getByRole('alert')).toContainText('이미 선택했습니다')
  await expect(form.locator('.tp-file-row', { hasText: 'dup.txt' })).toHaveCount(1)
  await form.getByLabel('파일 추가').setInputFiles({ name: 'huge.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(6 * 1024 * 1024) })
  await expect(form.getByRole('alert')).toContainText('huge.mp4')
  await expect(form.getByRole('alert')).toContainText('최대 5MB')
  await expect(form.getByText('파일 하나는 최대 5MB')).toBeVisible()
  const sent = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/submission'))
  await form.getByRole('button', { name: '제출하기' }).click()
  const body = (await sent).postDataBuffer().toString('latin1')
  expect(body).toContain('filename="topic.hwp"')
  expect(body).not.toContain('huge.mp4')
  expect(body.match(/filename="dup\.txt"/g)).toHaveLength(1)
  expect(body).toContain('https://github.com/coms/attendance')
  expect(body).toContain('https://example.com/figma')
  const article = page.getByRole('article', { name: '주제 선정 제출' })
  await expect(article.getByText('출석 체크 앱을 만듭니다.')).toBeVisible()
  await expect(article.getByRole('link', { name: 'topic.hwp' })).toHaveAttribute('download', '')
  await expect(article.getByRole('link', { name: 'https://example.com/figma' })).toHaveAttribute('rel', /noopener/)
  await expect(article.getByText('제출', { exact: true })).toBeVisible()

  // ---- 수정: 올린 파일을 빼면 저장 전까지 표시만 되고, 저장하면 사라진다
  await article.getByRole('button', { name: '수정하기' }).click()
  const editForm = page.getByRole('form', { name: '주제 선정 제출' })
  await editForm.getByLabel('파일 추가').setInputFiles({ name: 'extra.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') })
  await editForm.getByRole('button', { name: 'topic.hwp 빼기' }).click()
  await expect(editForm.getByText('저장 시 삭제')).toBeVisible()
  await expect(editForm.locator('[data-removed] .tp-file-name')).toHaveCSS('text-decoration-line', 'line-through')
  await editForm.getByRole('button', { name: 'topic.hwp 삭제 취소' }).click()
  await expect(editForm.getByText('저장 시 삭제')).toHaveCount(0)
  await editForm.getByRole('button', { name: 'topic.hwp 빼기' }).click()
  const resent = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/submission'))
  await editForm.getByRole('button', { name: '수정 저장' }).click()
  expect((await resent).postDataBuffer().toString('latin1')).toContain('name="removeFileIds"')
  await expect(article.getByRole('link', { name: 'extra.zip' })).toBeVisible()
  await expect(article.getByRole('link', { name: 'topic.hwp' })).toHaveCount(0)

  // ---- 마감이 지난 일정에 내도 받아 주되 '늦은 제출'로 표시된다
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
  await expect(opened.getByRole('link', { name: 'extra.zip' })).toBeVisible()
  // 회장 계정은 팀이 없어 회원 화면에서 관리 화면으로 안내받는다
  await page.goto('/team-projects/1')
  await expect(page.getByRole('link', { name: '관리 화면의 제출 현황' })).toBeVisible()
})

test('the status board marks edits made after the due time', async ({ page }) => {
  await mockAdminApis(page)
  const db = await installFakeApi(page)
  db.program = { id: 1, title: '팀프', description: '', open: true }
  db.milestones = [{ id: 11, position: 0, title: '지난 과제', description: '', startsAt: null, dueAt: '2020-01-01T23:59:00', allDay: false, submittable: true }]
  db.teams = [{ id: 21, name: 'A팀', topic: '', intro: '' }]
  db.members = [{ teamId: 21, studentId: '2020000001' }]
  db.submissions = [{ id: 31, teamId: 21, milestoneId: 11, body: 'x', links: [], files: [], submittedByName: '김하나', submittedAt: '2019-12-31T10:00:00', updatedByName: '김하나', updatedAt: '2020-01-02T09:00:00' }]
  await page.goto('/admin?tab=team-projects&program=1')
  const cell = page.getByRole('button', { name: 'A팀 지난 과제 제출 마감 후 수정' })
  await expect(cell).toBeVisible()
  await expect(cell).toContainText('마감 후 수정')
})

test('an oversized upload rejected by the proxy names the real limit, and an upload can be cancelled', async ({ page }) => {
  await mockAdminApis(page)
  const db = await installFakeApi(page)
  db.program = { id: 1, title: '팀프', description: '', open: true }
  db.milestones = [{ id: 11, position: 0, title: '최종', description: '', startsAt: null, dueAt: '2099-01-01T23:59:00', allDay: false, submittable: true }]
  db.teams = [{ id: 21, name: 'A팀', topic: '', intro: '' }]
  db.members = [{ teamId: 21, studentId: '2020000001' }]
  db.me = 'hana'
  await page.goto('/team-projects/1')
  const form = page.getByRole('form', { name: '최종 제출' })
  await form.getByLabel('파일 추가').setInputFiles({ name: 'a.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('a') })
  db.uploadStatus = 413
  await form.getByRole('button', { name: '제출하기' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '파일이 너무 큽니다' })).toContainText('최대 5MB')
  db.uploadStatus = 0
  db.uploadDelay = 3000
  await form.getByRole('button', { name: '제출하기' }).click()
  await expect(form.getByRole('progressbar', { name: '업로드 진행률' })).toBeVisible()
  await form.getByRole('button', { name: '업로드 취소' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '업로드를 취소했습니다' })).toBeVisible()
  await expect(form.getByRole('button', { name: '제출하기' })).toBeEnabled()
})

for (const width of [390, 320]) {
  test(`member page and admin board fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await mockAdminApis(page)
    const db = await installFakeApi(page)
    db.program = { id: 1, title: '2026-2 팀 프로젝트', description: '한 학기 동안 팀별 결과물을 만듭니다.', open: true }
    db.milestones = [
      { id: 11, position: 0, title: '주제 선정', description: '팀별 프로젝트 주제 및 간단한 소개 제출', startsAt: null, dueAt: stamp(1, '23:59:00'), allDay: false, submittable: true },
      { id: 12, position: 1, title: '시험·보강 기간', description: '의무 제출 없음', startsAt: `${stamp(10, '00:00:00').slice(0, 10)}T00:00:00`, dueAt: `${stamp(24, '00:00:00').slice(0, 10)}T00:00:00`, allDay: true, submittable: false },
    ]
    db.teams = [{ id: 21, name: '아주아주긴이름의팀프로젝트팀', topic: '긴 주제 '.repeat(12), intro: '' }]
    db.members = [{ teamId: 21, studentId: '2020000001' }]
    db.me = 'hana'
    await page.goto('/team-projects/1')
    await expect(page.getByRole('region', { name: '다음 일정' })).toContainText('D-1')
    await expect(page.getByRole('listitem').filter({ hasText: '시험·보강 기간' })).toContainText('제출 없음')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // the submit button is reachable and a comfortable tap target
    const submit = page.getByRole('button', { name: '제출하기' })
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeInViewport()
    expect((await submit.boundingBox()).height).toBeGreaterThanOrEqual(44)
    db.me = 'admin'
    await page.goto('/admin?tab=team-projects&program=1')
    await expect(page.getByRole('region', { name: '팀별 제출 현황' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
