// Registry of the /study pages. Plain data on purpose (no imports, no Vite-only syntax): the build
// config and the unit tests read it too, for page titles, link previews and the sitemap.
// The markup of study <id> lives in ./content/<id>.html and is loaded by studyContent.ts.

export interface Study {
  id: string
  title: string
  subtitle: string
  description: string
  tags: string[]
  /** localStorage key holding { [partId]: boolean } for the "done" checkboxes. */
  progressKey: string
}

export const STUDIES: Study[] = [
  {
    id: 'web',
    title: '웹 기초',
    subtitle: 'HTML · CSS · JavaScript',
    description: '처음 만드는 웹페이지. 예제를 바로 고쳐 보며 배워요.',
    tags: ['HTML', 'CSS', 'JavaScript'],
    progressKey: 'coms-web-study-progress',
  },
  {
    id: 'arduino',
    title: '아두이노 기초',
    subtitle: 'Arduino UNO · 회로 · 센서',
    description: 'LED부터 센서와 모터까지, 직접 만지는 하드웨어 첫걸음.',
    tags: ['Arduino', '회로', '센서'],
    progressKey: 'coms-arduino-study-progress',
  },
  {
    id: 'c',
    title: 'C 기초',
    subtitle: 'C 언어',
    description: '변수부터 포인터까지, 컴퓨터가 일하는 방식을 가까이에서.',
    tags: ['C', '포인터', '메모리'],
    progressKey: 'coms-c-study-progress',
  },
  {
    id: 'java',
    title: 'Java 기초',
    subtitle: 'Java 17+',
    description: '클래스와 객체로 프로그램을 짜는 객체지향 기본기.',
    tags: ['Java', '객체지향'],
    progressKey: 'coms-java-study-progress',
  },
  {
    id: 'python',
    title: 'Python 기초',
    subtitle: 'Python 3',
    description: '가장 쉽게 시작하는 프로그래밍. 문법부터 작은 프로그램까지.',
    tags: ['Python', '문법'],
    progressKey: 'coms-python-study-progress',
  },
]

export function findStudy(id: string | undefined) {
  return STUDIES.find((study) => study.id === id)
}
