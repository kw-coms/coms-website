const file = (id, projectId, kind, url, label = '') => ({ id, projectId, kind, label, originalName: url.split('/').at(-1), mimeType: url.endsWith('.pdf') ? 'application/pdf' : url.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : url.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg', fileSize: 1000, url })
const project = (projectId, title, author, description, github, live, presentation = 'presentation.pdf', start = 1) => ({
  projectId, title, author, description, github, live, position: start,
  materials: [file(start, projectId, 'proposal', `/hackathon-2026/${projectId}/proposal.pdf`, '계획서 PDF'), file(start + 1, projectId, 'presentation', `/hackathon-2026/${projectId}/${presentation}`, `발표 자료 ${presentation.endsWith('.pptx') ? 'PPTX' : 'PDF'}`), file(start + 2, projectId, 'video', `/hackathon-2026/${projectId}/demo.mp4`, '시연 영상'), file(start + 3, projectId, 'poster', `/hackathon-2026/${projectId}/poster.jpg`, '포스터')],
})
export const legacyEvent = {
  id: 1, title: 'COM’s 해커톤 2026', year: 2026, semester: 2, open: true, allowGuestReviews: true, published: true,
  startsAt: '2026-11-08T18:00:00', endsAt: '2026-11-15T04:00:00', status: 'REVIEWING', resultsPublished: false, results: [],
  theme: '전쟁', introduction: '전쟁이 일어났을 때, 사람들에게 무엇이 필요할까요?\n그 문제를 해결하는 서비스를 만드는 해커톤입니다. 개발 기간은 11월 8일 18:00부터 11월 15일 04:00까지입니다.',
  rules: '5개 항목을 각 20점, 총 100점으로 평가합니다. 최종 점수는 졸업생 평균 50% + 회장 평가 50%이며, 동점이면 완성도 → 주제 적합성 순으로 결정합니다.',
  materials: [file(100, null, 'presentation', '/hackathon-2026/opening.pptx', '개회식 안내·전체 규칙 PPTX')],
  projects: [
    project('wargether', 'wargether', '정자인', '전쟁으로 끊어진 관계를 학습·여가 모임으로 다시 잇는 플랫폼입니다.', 'https://github.com/ja-in0817/COM-s-', 'https://example.com/wargether', 'presentation.pdf', 1),
    project('underground-route', '지하로', '이찬율', '철도 터널망에서 지상 노출이 적은 경로를 안내합니다.', 'https://github.com/cy7mvpboy/underground-route', 'https://example.com/route', 'presentation.pdf', 5),
    project('still', 'Still', '정한아 · 한아님', '떨어진 가족이 짧은 영상과 음성으로 일상을 나눕니다.', 'https://github.com/JeongHanAh/2026COM-s-Hackathon', 'https://example.com/still', 'presentation.pptx', 9),
  ],
}
export const futureEvent = { id: 2, title: '2027년 1학기 해커톤', year: 2027, semester: 1, open: true, allowGuestReviews: true, published: true, startsAt: null, endsAt: null, status: 'REVIEWING', resultsPublished: false, results: [], theme: '캠퍼스', introduction: '새 행사 소개', rules: '각 항목 20점', materials: [], projects: [{ projectId: 'future-team', title: '새 팀', author: '테스트 팀', description: '새 행사 작품입니다.', github: null, live: null, position: 0, materials: [] }] }
export const summary = (event) => ({ id: event.id, title: event.title, year: event.year, semester: event.semester, open: event.open, allowGuestReviews: event.allowGuestReviews, theme: event.theme, startsAt: event.startsAt, endsAt: event.endsAt, status: event.status, resultsPublished: event.resultsPublished, projectCount: event.projects.length })
export const adminSummary = (event) => ({ id: event.id, title: event.title, year: event.year, semester: event.semester, open: event.open, published: event.published, startsAt: event.startsAt, endsAt: event.endsAt, status: event.status, resultsPublished: event.resultsPublished })
// 지난 행사: 평가가 닫히고 결과가 공개된 기록. 작품 자료는 그대로 남아 있다.
export const doneEvent = {
  id: 3, title: '2025년 2학기 해커톤', year: 2025, semester: 2, open: false, published: true,
  startsAt: '2025-11-08T18:00:00', endsAt: '2025-11-15T04:00:00', status: 'DONE', resultsPublished: true,
  theme: '재난', introduction: '재난 상황을 돕는 서비스를 만든 해커톤입니다.', rules: '각 항목 20점 만점',
  materials: [file(300, null, 'presentation', '/hackathon-2025/opening.pptx', '2025 개회식 자료')],
  projects: [
    { projectId: 'alpha', title: '알파', author: '1팀', description: '재난 알림 서비스', github: null, live: null, position: 0,
      materials: [file(301, 'alpha', 'poster', '/hackathon-2025/alpha/poster.jpg', '알파 포스터'), file(302, 'alpha', 'proposal', '/hackathon-2025/alpha/proposal.pdf', '알파 계획서')] },
    { projectId: 'beta', title: '베타', author: '2팀', description: '대피소 안내 서비스', github: null, live: null, position: 1, materials: [] },
  ],
  results: [
    { projectId: 'alpha', title: '알파', author: '1팀', rank: 1, finalScore: 88.5, alumniAverage: 87, chairScore: 90, alumniCount: 4, criteria: { themeFit: 18, creativity: 17.5, technology: 17, completeness: 18, practicality: 18 } },
    { projectId: 'beta', title: '베타', author: '2팀', rank: 2, finalScore: 80, alumniAverage: 78, chairScore: 82, alumniCount: 4, criteria: { themeFit: 16, creativity: 16, technology: 16, completeness: 16, practicality: 16 } },
  ],
}
export const upcomingEvent = { ...futureEvent, id: 4, title: '2027년 2학기 해커톤', semester: 2, open: false, status: 'UPCOMING', startsAt: '2027-11-06T18:00:00', endsAt: '2027-11-13T04:00:00', projects: [] }
export const progressEvent = { ...futureEvent, id: 5, title: '2026년 1학기 해커톤', year: 2026, semester: 1, open: false, status: 'IN_PROGRESS', startsAt: '2026-05-01T09:00:00', endsAt: '2026-05-08T21:00:00' }
