// 2026 activity timeline shown on /activities.
// Every fact below comes from the club's own decks (개강총회, 창립제, 해커톤) and recruiting posters. A date that the
// sources do not give is left out (dateLabel carries the semester only) rather than guessed.

export type TimelineStatus = 'done' | 'live' | 'confirmed' | 'planned'
export type TimelineTerm = 'spring' | 'fall' | 'upcoming'

export interface TimelinePhoto {
  id: string
  /** File stem under /member-media/activities/2026/ (members only, served by nginx; not in the repo) (`<stem>-1600.webp` and `<stem>-800.webp`). */
  stem: string
  /** Pixel size of the large file (fixes the aspect ratio before the image loads). */
  width: number
  height: number
  /** Pixel width of the small file, for the srcset width descriptor. */
  smallWidth: number
  alt: string
  caption?: string
  /** CSS object-position used when a card crops the photo to 4:3. */
  focus?: string
}

export interface TimelineEvent {
  id: string
  term: TimelineTerm
  title: string
  /** Text shown in the date rail, e.g. "03.09" or "11.08 – 11.15". */
  dateLabel: string
  /** Machine-readable start (and end) for <time>; omitted when the day is unknown. */
  start?: string
  end?: string
  /** Status when the dates do not decide it. Dated events with `start` + `end` are resolved at runtime. */
  status: TimelineStatus
  kind: string
  summary: string
  facts?: string[]
  /** Internal agenda lines, shown to signed-in members only. */
  memberFacts?: string[]
  photoId?: string
}

const photo = (p: TimelinePhoto): TimelinePhoto => p

export const timelinePhotos: TimelinePhoto[] = [
  photo({ id: 'spring-opening', stem: 'spring-opening', width: 1600, height: 1200, smallWidth: 800, alt: '식당 테이블에 둘러앉아 브이를 하는 부원들', caption: '1학기 개강총회' }),
  photo({ id: 'spring-mt', stem: 'spring-mt', width: 1600, height: 901, smallWidth: 800, alt: 'MT에서 긴 테이블에 나란히 앉은 부원들', caption: '1학기 MT' }),
  photo({ id: 'spring-alumni-night', stem: 'spring-alumni-night', width: 1600, height: 738, smallWidth: 800, alt: '컴스인의 밤 강의실에서 선배님들과 함께 찍은 단체 사진', caption: '컴스인의 밤, 선배님과 함께하는 교류회' }),
  photo({ id: 'spring-closing', stem: 'spring-closing', width: 1600, height: 1200, smallWidth: 800, alt: '종강총회 강의실에서 발표 화면을 보는 부원들', caption: '1학기 종강총회' }),
  photo({ id: 'spring-lotte-world', stem: 'spring-lotte-world', width: 1600, height: 901, smallWidth: 800, alt: '롯데월드 회전목마 앞에서 포즈를 취한 단체 사진', caption: '1학기 단체모임, 롯데월드' }),
  photo({ id: 'club-food', stem: 'club-food', width: 1600, height: 738, smallWidth: 800, alt: '컴슐랭 소모임에서 먹은 식사 한 상', caption: '소모임 컴슐랭, 맛집 탐방' }),
  photo({ id: 'club-climbing', stem: 'club-climbing', width: 901, height: 1600, smallWidth: 450, alt: '클라이밍장 벽을 오르는 컴라이밍 소모임', caption: '소모임 컴라이밍, 클라이밍', focus: '50% 40%' }),
  photo({ id: 'club-badminton', stem: 'club-badminton', width: 1600, height: 1200, smallWidth: 800, alt: '배드민턴 코트에서 브이를 하는 컴스민턴 소모임 부원', caption: '소모임 컴스민턴, 배드민턴' }),
  photo({ id: 'fall-opening', stem: 'fall-opening', width: 1200, height: 1600, smallWidth: 600, alt: '2학기 개강총회 자리에서 브이를 하는 부원들', caption: '2학기 개강총회', focus: '50% 35%' }),
  photo({ id: 'fall-mt', stem: 'fall-mt', width: 1600, height: 1200, smallWidth: 800, alt: 'MT 숙소 바닥에 둘러앉은 부원들', caption: '2학기 MT' }),
  photo({ id: 'founding-group', stem: 'founding-group', width: 1600, height: 1200, smallWidth: 800, alt: '57주년 창립제 단체 사진', caption: '57주년 창립제 단체 사진, 2026.11.07' }),
  photo({ id: 'founding-group-2', stem: 'founding-group-2', width: 1600, height: 1200, smallWidth: 800, alt: '창립제에서 손을 들어 인사하는 부원과 선배님들의 단체 사진', caption: '57주년 창립제 단체 사진 두 번째 컷' }),
  photo({ id: 'founding-presentation', stem: 'founding-presentation', width: 1600, height: 1200, smallWidth: 800, alt: '창립제 발표 화면 앞에 테이블별로 둘러앉은 모습', caption: '57주년 창립제 진행 모습' }),
]

export const timelineEvents: TimelineEvent[] = [
  // 2026 1학기: the sources give no day for these, so none is shown.
  {
    id: 'spring-opening',
    term: 'spring',
    title: '개강총회',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '행사',
    summary: '2026학년도 1학기의 문을 연 개강총회입니다. 사진은 식사 자리에서 찍은 모습입니다.',
    photoId: 'spring-opening',
  },
  {
    id: 'spring-study',
    term: 'spring',
    title: '정기 스터디',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '스터디',
    summary: '언어, 알고리즘, 프로젝트를 중심으로 꾸린 정기 스터디입니다. 파이썬 스터디와 알고리즘 스터디, 시험기간 스터디가 있었습니다.',
  },
  {
    id: 'spring-project',
    term: 'spring',
    title: 'COM’s 웹사이트 제작',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '프로젝트',
    summary: '부원들이 지금 보고 있는 동아리 웹사이트 coms.kw.ac.kr을 만들었습니다.',
  },
  {
    id: 'spring-mt',
    term: 'spring',
    title: 'MT',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '행사',
    summary: '1박 2일로 다녀온 MT입니다. 고기를 먹고 밤새 이야기를 나눴습니다.',
    photoId: 'spring-mt',
  },
  {
    id: 'spring-alumni-night',
    term: 'spring',
    title: '컴스인의 밤',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '행사',
    summary: '졸업하신 동아리 선배님들을 만나 진로와 개발 이야기를 나눴습니다. 뒤풀이에서는 선배, 동기와 한 테이블에 앉았습니다.',
    photoId: 'spring-alumni-night',
  },
  {
    id: 'spring-closing',
    term: 'spring',
    title: '종강총회',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '행사',
    summary: '한 학기를 정리하는 자리였습니다.',
    photoId: 'spring-closing',
  },
  {
    id: 'spring-lotte-world',
    term: 'spring',
    title: '단체모임, 롯데월드',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '행사',
    summary: '1학기 놀러 가기는 놀이공원이었습니다. 부원들이 롯데월드에 함께 다녀왔습니다.',
    photoId: 'spring-lotte-world',
  },
  {
    id: 'spring-dinner',
    term: 'spring',
    title: '동아리 회식',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '행사',
    summary: '시험이 끝나면 자연스럽게 모이는 자리입니다.',
  },
  {
    id: 'spring-journal',
    term: 'spring',
    title: '학술회지 2026 57th Edition',
    dateLabel: '2026 1학기',
    status: 'done',
    kind: '출간',
    summary: '부원들이 직접 쓴 글을 모아 엮은 학술회지의 2026년 1학기 호가 나왔습니다.',
  },

  // 2026 2학기
  {
    id: 'fall-opening',
    term: 'fall',
    title: '개강총회',
    dateLabel: '09.07',
    start: '2026-09-07',
    status: 'done',
    kind: '행사',
    summary: '개강총회 자료는 이번 학기 임원진, 지난 학기 활동, 이번 학기 운영 방향, 스터디 운영 안내, 소모임 안내를 차례로 다룹니다.',
    facts: [
      '80주년기념관 202호',
      'COM’s 문제 공모전: 제출 마감 9월 10일',
    ],
    memberFacts: ['안건: 동아리방 이용 규칙 개정안, 준회원제 도입'],
    photoId: 'fall-opening',
  },
  {
    id: 'fall-mt',
    term: 'fall',
    title: 'MT',
    dateLabel: '2026 2학기',
    status: 'done',
    kind: '행사',
    summary: '2학기 친목 활동으로 다녀온 MT입니다.',
    photoId: 'fall-mt',
  },
  {
    id: 'fall-study',
    term: 'fall',
    title: '고급 C 프로그래밍 · 블록체인 스터디',
    dateLabel: '2026 2학기',
    status: 'confirmed',
    kind: '스터디',
    summary: '이번 학기 스터디로 확정된 두 스터디입니다.',
  },
  {
    id: 'fall-founding',
    term: 'fall',
    title: '57주년 COM’s 창립제',
    dateLabel: '11.07',
    start: '2026-11-07',
    status: 'done',
    kind: '행사',
    summary: '광운대학교 중앙 컴퓨터 학술동아리는 1969년에 창립해 57년을 이어왔습니다. 진행 순서에는 선배님 소개, 테이블별 선후배 교류, 부원 질문이 있습니다.',
    facts: ['2026.11.07 (토) 18:00', '80주년기념관 303호'],
    photoId: 'founding-group',
  },
  {
    id: 'fall-hackathon',
    term: 'fall',
    title: 'COM’s 해커톤 2026',
    dateLabel: '11.08 – 11.15',
    start: '2026-11-08T18:00:00+09:00',
    end: '2026-11-15T04:00:00+09:00',
    status: 'live',
    kind: '해커톤',
    summary: '주제는 ‘전쟁’입니다. 전쟁이 일어났을 때 사람들에게 무엇이 필요한지 찾아, 그 문제를 해결하는 서비스를 만듭니다. 제출 마감은 11월 15일 새벽 4시입니다.',
    facts: [
      '4팀 참가, 개회식부터 제출 마감까지 154시간',
      '평가: 졸업생 평가 50점 + 회장 평가 50점, 합계 100점',
    ],
  },

  // 예정
  {
    id: 'next-hackathon-result',
    term: 'upcoming',
    title: '해커톤 결과 · 시상 공지',
    dateLabel: '평가 완료 후',
    status: 'planned',
    kind: '해커톤',
    summary: '평가가 끝나면 결과와 시상을 공지합니다.',
  },
  {
    id: 'next-study',
    term: 'upcoming',
    title: '아두이노 · 알고리즘 스터디',
    dateLabel: '2026 2학기',
    status: 'planned',
    kind: '스터디',
    summary: '2학기 스터디로 예정되어 있습니다.',
  },
  {
    id: 'next-project',
    term: 'upcoming',
    title: '팀 프로젝트',
    dateLabel: '2026 2학기',
    status: 'planned',
    kind: '프로젝트',
    summary: '2학기 프로젝트 활동으로 예정되어 있습니다.',
  },
  {
    id: 'next-closing',
    term: 'upcoming',
    title: '종강총회 · 에버랜드',
    dateLabel: '2026 2학기',
    status: 'planned',
    kind: '행사',
    summary: '2학기 친목 활동으로 종강총회와 에버랜드가 예정되어 있습니다.',
  },
]

export const summerClubs = [
  { id: 'club-food', name: '컴슐랭', what: '맛집 탐방', photoId: 'club-food' },
  { id: 'club-climbing', name: '컴라이밍', what: '클라이밍', photoId: 'club-climbing' },
  { id: 'club-badminton', name: '컴스민턴', what: '배드민턴', photoId: 'club-badminton' },
]

export const foundingProgram = [
  { time: '18:00', label: '오프닝 및 COM’s 간단 소개' },
  { label: '선배님 소개' },
  { label: '테이블별 선후배 교류' },
  { label: '부원 질문' },
  { label: '단체사진 촬영 및 마무리' },
  { time: '19:30', label: '뒤풀이 장소 이동' },
]

/** Photos shown with the 창립제 feature, after the lead photo. */
export const foundingExtraPhotoIds = ['founding-presentation', 'founding-group-2']

/** Resolve the status at `now`: dated ranges decide for themselves, everything else uses its stored status. */
export function resolveStatus(event: TimelineEvent, now: number): TimelineStatus {
  if (event.start && event.end) {
    if (now < Date.parse(event.start)) return 'planned'
    if (now < Date.parse(event.end)) return 'live'
    return 'done'
  }
  return event.status
}

export const statusLabel: Record<TimelineStatus, string> = {
  done: '완료',
  live: '진행 중',
  confirmed: '확정',
  planned: '예정',
}

export function photoSrc(p: TimelinePhoto) {
  return {
    src: `/member-media/activities/2026/${p.stem}-1600.webp`,
    srcSet: `/member-media/activities/2026/${p.stem}-800.webp ${p.smallWidth}w, /member-media/activities/2026/${p.stem}-1600.webp ${p.width}w`,
  }
}
