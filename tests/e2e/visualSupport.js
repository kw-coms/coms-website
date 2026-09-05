export async function mockOptionalApis(page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.route('**/api/fonts', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notices', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/club-projects/categories', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, key: 'WEBSITE', name: '웹사이트', position: 1 },
      { id: 2, key: 'APP', name: '앱', position: 2 },
      { id: 3, key: 'GAME', name: '게임', position: 3 },
    ],
  }))
  await page.route('**/api/club-projects', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, category: 'WEBSITE', categoryName: '웹사이트', title: 'Food Club', description: '식사 모임 허브', eyebrow: 'Meal loop', madeBy: '최준혁', linkUrl: 'https://coms.kw.ac.kr/foodclub/', displayUrl: 'coms.kw.ac.kr/foodclub', files: [] },
      { id: 2, category: 'WEBSITE', categoryName: '웹사이트', title: 'TeamMate', description: '팀 편성 도구', eyebrow: 'Team randomizer', madeBy: '최준혁', linkUrl: 'https://coms.kw.ac.kr/team-randomizer/', displayUrl: 'coms.kw.ac.kr/team-randomizer', files: [] },
      { id: 3, category: 'GAME', categoryName: '게임', title: 'Game Club', description: '게임 이벤트 공간', eyebrow: 'Playground', madeBy: '최준혁', linkUrl: 'https://coms.kw.ac.kr/gameclub/', displayUrl: 'coms.kw.ac.kr/gameclub', files: [] },
      { id: 4, category: 'WEBSITE', categoryName: '웹사이트', title: 'KW Mate', description: '광운대 생활 연결 서비스', eyebrow: 'Campus utility', madeBy: '최준혁', linkUrl: 'http://kwmate.com/', displayUrl: 'kwmate.com', files: [] },
      { id: 5, category: 'WEBSITE', categoryName: '웹사이트', title: 'Daily Coding', description: '매일 코딩 연습 공간', eyebrow: 'Practice', madeBy: '최준혁', linkUrl: 'https://dailycoding-final.com/', displayUrl: 'dailycoding-final.com', files: [] },
      { id: 6, category: 'WEBSITE', categoryName: '웹사이트', title: 'PRDoctor', description: 'PR 리뷰 보조 도구', eyebrow: 'PR review', madeBy: '최준혁', linkUrl: 'https://coms.kw.ac.kr/PRDoctor', displayUrl: 'coms.kw.ac.kr/PRDoctor', files: [] },
    ],
  }))
}

export async function mockAdminApis(page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    json: {
      id: 1,
      name: '관리자',
      studentId: '2020123456',
      role: 'ADMIN',
      emailVerified: true,
    },
  }))
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 204 }))
  await page.route('**/api/fonts', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/admin/members', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/admin/community/deleted-posts**', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notifications/summary', (route) => route.fulfill({ status: 200, json: { unreadCount: 0 } }))
  await page.route('**/api/club-activities/categories', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, key: 'GENERAL', name: '일반', position: 0, activityCount: 0 },
      { id: 2, key: 'SEMINAR', name: '세미나', position: 1, activityCount: 0 },
      { id: 3, key: 'STUDY', name: '스터디', position: 2, activityCount: 0 },
      { id: 4, key: 'PROJECT', name: '프로젝트', position: 3, activityCount: 0 },
      { id: 5, key: 'MEETING', name: '회의', position: 4, activityCount: 0 },
    ],
  }))
  await page.route('**/api/club-activities/schedule**', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/admin/recurring-schedules**', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/club-activities', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/club-events', (route) => route.fulfill({
    status: 200,
    json: [
      {
        id: 1,
        title: '회지 인기투표',
        description: '가장 좋았던 회지를 골라주세요.',
        startsAt: '2026-06-21T00:00:00',
        endsAt: '2026-06-30T23:59:00',
        votingOpen: true,
        totalVotes: 7,
        myEntryId: 2,
        entryCount: 2,
        createdByName: '관리자',
        createdAt: '2026-06-21T12:00:00',
        updatedAt: '2026-06-21T12:10:00',
        entries: [
          {
            id: 2,
            title: '여름호',
            authorName: '운영팀',
            description: '여름 활동 회지',
            workType: 'MAGAZINE',
            summary: '여름 활동 사진과 후기를 묶은 정기 회지입니다.',
            tags: '여름호, 활동기록, PDF',
            externalUrl: 'https://coms.kw.ac.kr/archive/summer',
            downloadUrl: '/api/club-events/1/entries/2/download',
            originalName: 'summer.pdf',
            mimeType: 'application/pdf',
            fileSize: 1200,
            files: [
              { id: 201, downloadUrl: '/api/club-events/1/entries/2/files/201/download', originalName: 'summer.pdf', mimeType: 'application/pdf', fileSize: 1200 },
              { id: 202, downloadUrl: '/api/club-events/1/entries/2/files/202/download', originalName: 'summer-source.zip', mimeType: 'application/zip', fileSize: 2400 },
            ],
            voteCount: 5,
            myVote: true,
            rank: 1,
            createdAt: '2026-06-21T12:10:00',
          },
          {
            id: 1,
            title: '봄호',
            authorName: '편집팀',
            description: '봄 활동 회지',
            workType: 'WEBZINE',
            summary: '신입생 활동을 웹진 형식으로 정리했습니다.',
            tags: '봄호, 웹진',
            externalUrl: '',
            downloadUrl: '/api/club-events/1/entries/1/download',
            originalName: 'spring.pdf',
            mimeType: 'application/pdf',
            fileSize: 1100,
            files: [
              { id: 101, downloadUrl: '/api/club-events/1/entries/1/files/101/download', originalName: 'spring.pdf', mimeType: 'application/pdf', fileSize: 1100 },
            ],
            voteCount: 2,
            myVote: false,
            rank: 2,
            createdAt: '2026-06-21T12:05:00',
          },
        ],
      },
    ],
  }))
  await page.route('**/api/club-events/1', (route) => route.fulfill({
    status: 200,
    json: {
      id: 1,
      title: '회지 인기투표',
      description: '가장 좋았던 회지를 골라주세요.',
      startsAt: '2026-06-21T00:00:00',
      endsAt: '2026-06-30T23:59:00',
      votingOpen: true,
      totalVotes: 7,
      myEntryId: 2,
      entryCount: 2,
      createdByName: '관리자',
      createdAt: '2026-06-21T12:00:00',
      updatedAt: '2026-06-21T12:10:00',
      entries: [
        {
          id: 2,
          title: '여름호',
          authorName: '운영팀',
          description: '여름 활동 회지',
          workType: 'MAGAZINE',
          summary: '여름 활동 사진과 후기를 묶은 정기 회지입니다.',
          tags: '여름호, 활동기록, PDF',
          externalUrl: 'https://coms.kw.ac.kr/archive/summer',
          downloadUrl: '/api/club-events/1/entries/2/download',
          originalName: 'summer.pdf',
          mimeType: 'application/pdf',
          fileSize: 1200,
          files: [
            { id: 201, downloadUrl: '/api/club-events/1/entries/2/files/201/download', originalName: 'summer.pdf', mimeType: 'application/pdf', fileSize: 1200 },
            { id: 202, downloadUrl: '/api/club-events/1/entries/2/files/202/download', originalName: 'summer-source.zip', mimeType: 'application/zip', fileSize: 2400 },
          ],
          voteCount: 5,
          myVote: true,
          rank: 1,
          createdAt: '2026-06-21T12:10:00',
        },
        {
          id: 1,
          title: '봄호',
          authorName: '편집팀',
          description: '봄 활동 회지',
          workType: 'WEBZINE',
          summary: '신입생 활동을 웹진 형식으로 정리했습니다.',
          tags: '봄호, 웹진',
          externalUrl: '',
          downloadUrl: '/api/club-events/1/entries/1/download',
          originalName: 'spring.pdf',
          mimeType: 'application/pdf',
          fileSize: 1100,
          files: [
            { id: 101, downloadUrl: '/api/club-events/1/entries/1/files/101/download', originalName: 'spring.pdf', mimeType: 'application/pdf', fileSize: 1100 },
          ],
          voteCount: 2,
          myVote: false,
          rank: 2,
          createdAt: '2026-06-21T12:05:00',
        },
      ],
    },
  }))

  // 권한 매트릭스 — 라우트는 LIFO 라 나중에 등록한 구체 경로가 먼저 매칭된다.
  // 회장(ADMIN) 세션이므로 /api/permissions/me 는 모든 키를 돌려준다.
  const PERMISSION_DESCRIPTORS = [
    { key: 'club_room.view', label: '동방 비밀번호 보기', description: '동방 출입 비밀번호를 조회할 수 있습니다.' },
    { key: 'community.anonymous_board', label: '익명게시판 이용', description: '익명 커뮤니티 게시판을 이용할 수 있습니다.' },
    { key: 'community.moderate', label: '커뮤니티 중재', description: '글 고정, 신고 처리, 삭제 보관함, 익명 작성자 확인을 수행할 수 있습니다.' },
    { key: 'notice.write', label: '공지 작성·수정·삭제·고정', description: '공지사항을 작성, 수정, 삭제, 고정할 수 있습니다.' },
    { key: 'activity.write', label: '활동·일정·이벤트·정기일정·카테고리 관리', description: '활동, 일정, 이벤트, 정기일정, 활동 카테고리를 관리할 수 있습니다.' },
    { key: 'project.write', label: "COM's 프로젝트 관리", description: "COM's 프로젝트와 프로젝트 카테고리를 관리할 수 있습니다." },
    { key: 'archive.manage', label: '자료실 삭제·작성자 변경', description: '자료실 파일을 삭제하고 작성자를 변경할 수 있습니다.' },
    { key: 'site_settings.edit', label: '사이트 문구·동방 비번 편집', description: '사이트 공개 문구와 동방 비밀번호를 편집할 수 있습니다.' },
    { key: 'operations.panel', label: '운영 패널 접근', description: '운영 패널과 권한이 허용된 운영 탭에 접근할 수 있습니다.' },
  ]
  const permissionMatrix = {
    roles: ['ASSOCIATE', 'USER', 'OFFICER', 'VICE_PRESIDENT'],
    permissions: PERMISSION_DESCRIPTORS,
    allowed: {
      ASSOCIATE: [],
      USER: ['club_room.view', 'community.anonymous_board'],
      OFFICER: ['club_room.view', 'community.anonymous_board', 'notice.write', 'activity.write', 'project.write', 'site_settings.edit', 'operations.panel'],
      VICE_PRESIDENT: PERMISSION_DESCRIPTORS.map((item) => item.key),
    },
    updatedAt: '2026-09-01T09:00:00',
    updatedBy: '2020123456',
  }
  await page.route('**/api/admin/permissions', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}')
      route.fulfill({ status: 200, json: { ...permissionMatrix, allowed: body.allowed || permissionMatrix.allowed } })
      return
    }
    route.fulfill({ status: 200, json: permissionMatrix })
  })
  await page.route('**/api/permissions/me', (route) => route.fulfill({
    status: 200,
    json: { role: 'ADMIN', permissions: PERMISSION_DESCRIPTORS.map((item) => item.key) },
  }))
}

// Auto-drive the app's confirm/prompt modal (ConfirmDialog.tsx) in e2e flows:
// when a modal appears, capture its message, fill the input (for prompts) with
// `promptValue`, and click the confirm button. Replaces window.confirm/prompt
// overrides now that the app uses an in-DOM modal. Captured messages are exposed
// on window.__modalPromptMessages.
export async function autoDriveModals(page, { promptValue = '' } = {}) {
  await page.addInitScript((value) => {
    window.__modalPromptMessages = []
    const setNativeValue = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const driven = new WeakSet()
    const drive = () => {
      const card = document.querySelector('.coms-confirm-card')
      // Wait until the confirm button has actually rendered before acting — the
      // card and its contents can mount across separate mutations.
      const ok = card && card.querySelector('.coms-confirm-ok')
      if (!card || !ok || driven.has(card)) return
      driven.add(card)
      window.__modalPromptMessages.push(card.querySelector('.coms-confirm-message')?.textContent || '')
      const input = card.querySelector('.coms-confirm-input')
      if (input) {
        setNativeValue(input, value)
        setTimeout(() => ok.click(), 0)
      } else {
        ok.click()
      }
    }
    const start = () => {
      new MutationObserver(drive).observe(document.body, { childList: true, subtree: true })
      // Interval fallback in case the relevant mutation is missed.
      setInterval(drive, 30)
      drive()
    }
    if (document.body) start()
    else window.addEventListener('DOMContentLoaded', start)
  }, promptValue)
}
