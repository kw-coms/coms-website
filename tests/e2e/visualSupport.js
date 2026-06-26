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
}
