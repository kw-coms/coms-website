import type { HackathonProject, HackathonReview, Scores } from '../../services/hackathonApi'

export const CRITERIA = [
  { key: 'themeFit', label: '주제 적합성', description: '주제에 맞는 문제를 골랐는가' },
  { key: 'creativity', label: '창의성', description: '아이디어가 새롭고 독창적인가' },
  { key: 'technology', label: '기술성', description: '구현 난이도와 기술 활용 수준' },
  { key: 'completeness', label: '완성도', description: '실제로 동작하고 마무리가 잘 되었는가' },
  { key: 'practicality', label: '실용성', description: '실제 상황에서 쓸모가 있는가' },
] as const

const materials = (id: string, presentation = 'presentation.pdf') => ({
  proposal: `/hackathon-2026/${id}/proposal.pdf`,
  presentation: `/hackathon-2026/${id}/${presentation}`,
  video: `/hackathon-2026/${id}/demo.mp4`,
  poster: `/hackathon-2026/${id}/poster.jpg`,
})

export const HACKATHON_PROJECTS = [
  {
    id: 'wargether', title: 'wargether', author: '정자인',
    description: '전쟁으로 끊어진 관계를 학습·여가 모임으로 다시 잇고, 출석 기록을 바탕으로 서로의 안부를 확인하는 플랫폼입니다.',
    github: 'https://github.com/ja-in0817/COM-s-', live: 'https://moa-together-za-in.brawnydream4.chatgpt.site/',
    ...materials('wargether'),
  },
  {
    id: 'underground-route', title: '지하로', author: '이찬율',
    description: '전쟁으로 지상 이동이 위험할 때, 철도 터널망에서 지상 노출이 적은 경로를 찾아 GPS·인터넷 없이도 이동을 안내하는 웹 앱입니다.',
    github: 'https://github.com/cy7mvpboy/underground-route', live: 'https://cy7mvpboy.github.io/underground-route/',
    ...materials('underground-route'),
  },
  {
    id: 'still', title: 'Still', author: '정한아 · 한아님',
    description: '전쟁·피란으로 떨어진 가족이 짧은 영상과 음성으로 일상을 나누고, 오프라인 기록과 기간별 내보내기로 소식을 이어 가는 모바일 웹 앱입니다.',
    github: 'https://github.com/JeongHanAh/2026COM-s-Hackathon', live: 'https://still-jeonghanah.onrender.com',
    ...materials('still', 'presentation.pptx'),
  },
]

export function reviewTotal(review: Scores) {
  return CRITERIA.reduce((total, { key }) => total + review[key], 0)
}

export function summarizeHackathon(reviews: HackathonReview[], projects: Pick<HackathonProject, 'projectId' | 'title'>[]) {
  const rows = projects.map((project) => {
    const alumni = reviews.filter((review) => review.projectId === project.projectId && !review.chair)
    const chair = reviews.find((review) => review.projectId === project.projectId && review.chair)
    const alumniAverage = alumni.length ? alumni.reduce((sum, review) => sum + reviewTotal(review), 0) / alumni.length : null
    const weighted = (key: keyof Scores) => chair && alumni.length
      ? (alumni.reduce((sum, review) => sum + review[key], 0) / alumni.length + chair[key]) / 2 : 0
    return {
      project, alumni, chair, alumniCount: alumni.length, alumniAverage,
      chairScore: chair ? reviewTotal(chair) : null,
      finalScore: alumniAverage !== null && chair ? (alumniAverage + reviewTotal(chair)) / 2 : null,
      completeness: weighted('completeness'), themeFit: weighted('themeFit'), rank: null as number | null,
    }
  })
  if (rows.some((row) => row.finalScore === null)) return rows
  const compare = (a: typeof rows[number], b: typeof rows[number]) => {
    for (const key of ['finalScore', 'completeness', 'themeFit'] as const) {
      const difference = b[key] - a[key]
      if (Math.abs(difference) > 1e-9) return difference
    }
    return 0
  }
  rows.sort(compare)
  rows.forEach((row, index) => { row.rank = index > 0 && compare(rows[index - 1], row) === 0 ? rows[index - 1].rank : index + 1 })
  return rows
}
