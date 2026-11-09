import { Binary, BookOpen, CalendarClock, CircuitBoard, FlaskConical, FolderOpen, LogIn, Megaphone, MessagesSquare, Palette, Rocket, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import type { TourKind } from '../components/tour/tourState'

/**
 * The site tour ("튜토리얼"). Every step names real things the site has (see the nav in
 * homeContent.ts and the routes in App.tsx). `targets` are CSS selectors for the elements the
 * step points at (the `data-tour` hooks); the spotlight covers all that are on screen. With no
 * target on screen (the nav is collapsed below lg, the page has no such element) the step is a
 * centred card, so every body reads on its own.
 */
export type TourStep = {
  id: string
  icon: LucideIcon
  title: string
  body: string
  targets?: string[]
}

const nav = (id: string) => `[data-tour="nav-${id}"]`

const GUEST_STEPS: TourStep[] = [
  {
    id: 'about',
    icon: Binary,
    title: "COM's는 이런 동아리예요",
    body: '광운대학교 학생들이 함께 공부하고 프로젝트를 만드는 중앙 컴퓨터 학술동아리예요. About에서 동아리 소개를 볼 수 있어요.',
    targets: [nav('about')],
  },
  {
    id: 'activities',
    icon: Sparkles,
    title: '이런 활동을 해요',
    body: '정기 세미나, 수준별 스터디, 팀 프로젝트, 선후배 교류가 있어요. 활동 타임라인은 누구나 볼 수 있고, 사진은 회원에게만 보여요.',
    targets: [nav('activities')],
  },
  {
    id: 'study-lab',
    icon: BookOpen,
    title: '읽고, 풀고, 만들어 봐요',
    body: 'Study에서 강의를 읽고 실습 문제를 풀어 볼 수 있어요. 코드 실행은 로그인 후 쓸 수 있어요. Lab에서는 아두이노 회로를 만들어 코드를 바로 돌려 볼 수 있어요.',
    targets: [nav('study'), nav('lab')],
  },
  {
    id: 'projects',
    icon: CircuitBoard,
    title: '부원들이 만든 결과물',
    body: 'Projects에는 실제로 만든 프로젝트가, Apps에는 바로 써 볼 수 있는 서비스가 모여 있어요.',
    targets: [nav('projects')],
  },
  {
    id: 'recruit',
    icon: Rocket,
    title: '함께하고 싶다면',
    body: 'Recruit에서 지원 안내를 확인하고 지원서를 낼 수 있어요.',
    targets: [nav('recruit')],
  },
  {
    id: 'login',
    icon: LogIn,
    title: '이미 동아리원이라면',
    body: "공지사항, 커뮤니티, 자료실, Records는 회원 전용이에요. 가입하고 로그인하면 열려요. 이 안내는 화면 맨 아래 '튜토리얼 시작'에서 다시 볼 수 있어요.",
    targets: ['[data-tour="login"]'],
  },
]

const MEMBER_STEPS: TourStep[] = [
  {
    id: 'notices',
    icon: Megaphone,
    title: '공지사항',
    body: '모집, 세미나, 운영 안내를 여기서 빠르게 확인해요.',
    targets: [nav('notices')],
  },
  {
    id: 'community',
    icon: MessagesSquare,
    title: '커뮤니티',
    body: '부원들과 질문하고 정보를 나누는 곳이에요. 말머리별로 글을 골라 볼 수 있어요.',
    targets: [nav('community')],
  },
  {
    id: 'resources',
    icon: FolderOpen,
    title: '자료실',
    body: '세미나 자료와 프로젝트 기록을 다시 찾아봐요.',
    targets: [nav('resources')],
  },
  {
    id: 'records',
    icon: CalendarClock,
    title: '활동 기록과 일정',
    body: 'Records에서 활동 기록, 월별 일정, 회지와 인기투표를 볼 수 있어요.',
    targets: [nav('records')],
  },
  {
    id: 'study-progress',
    icon: BookOpen,
    title: '푼 문제가 쌓여요',
    body: 'Study의 연습 문제를 풀면 진도가 저장돼요. 저장은 이 브라우저에 되니, 같은 기기에서 이어서 풀어 보세요.',
    targets: [nav('study')],
  },
  {
    id: 'lab',
    icon: FlaskConical,
    title: 'Lab',
    body: '브라우저에서 아두이노 회로를 만들고 코드를 바로 돌려 봐요.',
    targets: [nav('lab')],
  },
  {
    id: 'appearance',
    icon: Palette,
    title: '화면 설정',
    body: '라이트와 다크 테마, 강조 색을 바꿀 수 있어요. 화면 맨 아래 \'화면 설정\'에서 열어요.',
    targets: ['[data-tour="appearance"]'],
  },
  {
    id: 'account',
    icon: UserRound,
    title: '계정 설정',
    body: "이름을 누르면 계정 설정이 열려요. 비밀번호와 알림 설정을 바꿀 수 있어요. 이 안내는 맨 아래 '튜토리얼 시작'에서 다시 볼 수 있어요.",
    targets: ['[data-tour="account"]'],
  },
]

export const TOUR_STEPS: Record<TourKind, TourStep[]> = { guest: GUEST_STEPS, member: MEMBER_STEPS }
