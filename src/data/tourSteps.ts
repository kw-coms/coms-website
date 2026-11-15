import { Binary, BookOpen, CalendarClock, CircuitBoard, FlaskConical, FolderOpen, LogIn, Megaphone, MessagesSquare, Palette, Rocket, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import type { TourKind, TourSurface } from '../components/tour/tourState'

/**
 * The site tour ("튜토리얼"). Every step names real things the site has (see navGroups in
 * homeContent.ts and the routes in App.tsx). `targets` are CSS selectors for the elements the
 * step points at; `surface` opens the real menu or FAQ before its entries are brought into view.
 */
export type TourStep = {
  id: string
  icon: LucideIcon
  title: string
  body: string
  targets?: string[]
  surface?: TourSurface
}

const item = (group: string, path: string) => `[data-tour-group="${group}"] [data-tour-path="${path}"]`

const QUESTIONS_STEP: TourStep = {
  id: 'questions',
  icon: MessagesSquare,
  title: '질문하기',
  body: '질문 창을 열었어요. 세 가지 자주 묻는 질문은 누르면 답을 바로 볼 수 있어요. 해결되지 않으면 다른 질문 보내기에서 이메일 문의를 남겨요. 안내를 마친 뒤 오른쪽 아래 질문하기로 다시 열 수 있어요.',
  surface: 'ask',
  targets: ['#coms-ask-panel'],
}

const GUEST_STEPS: TourStep[] = [
  {
    id: 'about',
    icon: Binary,
    title: "COM's는 이런 동아리예요",
    body: '광운대학교 학생들이 함께 공부하고 프로젝트를 만드는 중앙 컴퓨터 학술동아리예요. 위 메뉴는 동아리·배움·멤버·도구로 나뉘고, 동아리의 소개에서 자세히 볼 수 있어요.',
    surface: 'club',
    targets: [item('club', '/about')],
  },
  {
    id: 'activities',
    icon: Sparkles,
    title: '이런 활동을 해요',
    body: '정기 세미나, 수준별 스터디, 팀 프로젝트, 선후배 교류가 있어요. 활동 타임라인은 누구나 볼 수 있고, 사진은 회원에게만 보여요.',
    surface: 'club',
    targets: [item('club', '/activities')],
  },
  {
    id: 'study-lab',
    icon: BookOpen,
    title: '읽고, 풀고, 만들어 봐요',
    body: '\'배움\' 메뉴의 스터디 자료에서는 과목과 장 제목을 둘러볼 수 있어요. 강의 본문과 실습 문제는 로그인한 동아리원에게 열려요. 회로 Lab은 누구나 열어 아두이노 회로를 만들어 볼 수 있고, 코드 컴파일은 로그인한 동아리원만 할 수 있어요.',
    surface: 'learn',
    targets: [item('learn', '/study'), item('learn', '/lab/')],
  },
  {
    id: 'projects',
    icon: CircuitBoard,
    title: '부원들이 만든 결과물',
    body: '\'동아리\' 메뉴의 프로젝트에서 제작 활동을 보고, \'도구\' 메뉴의 작품에서 부원들이 만든 서비스를 둘러볼 수 있어요. 로그인한 부원은 작품을 올릴 수도 있어요.',
    surface: 'tools',
    targets: [item('tools', '/apps')],
  },
  {
    id: 'recruit',
    icon: Rocket,
    title: '함께하고 싶다면',
    body: '\'동아리\' 메뉴의 지원하기에서 지원 안내를 확인하고 지원서를 낼 수 있어요.',
    surface: 'club',
    targets: [item('club', '/recruit')],
  },
  QUESTIONS_STEP,
  {
    id: 'login',
    icon: LogIn,
    title: '이미 동아리원이라면',
    body: "공지, 커뮤니티, 자료실, 활동 기록과 일정, 모임 신청·일정 조율·출석 체크는 회원 전용이라 메뉴에 자물쇠가 붙어 있어요. 눌러 보면 안내 화면이 열리고, 가입하고 로그인하면 쓸 수 있어요. 이 안내는 화면 맨 아래 '튜토리얼 시작'에서 다시 볼 수 있어요.",
    targets: ['[data-tour="login"]'],
  },
]

const MEMBER_STEPS: TourStep[] = [
  {
    id: 'notices',
    icon: Megaphone,
    title: '공지사항',
    body: '모집, 세미나, 운영 안내를 \'멤버\' 메뉴의 공지에서 빠르게 확인해요.',
    surface: 'members',
    targets: [item('members', '/notices')],
  },
  {
    id: 'community',
    icon: MessagesSquare,
    title: '커뮤니티',
    body: '부원들과 질문하고 정보를 나누는 곳이에요. 말머리별로 글을 골라 볼 수 있어요.',
    surface: 'members',
    targets: [item('members', '/community')],
  },
  {
    id: 'resources',
    icon: FolderOpen,
    title: '자료실',
    body: '세미나 자료와 프로젝트 기록을 다시 찾아봐요.',
    surface: 'members',
    targets: [item('members', '/resources')],
  },
  {
    id: 'records',
    icon: CalendarClock,
    title: '활동 기록과 일정',
    body: '\'멤버\' 메뉴에서 활동 기록, 월별 일정, 회지와 인기투표를 볼 수 있어요.',
    surface: 'members',
    targets: [item('members', '/activity-log')],
  },
  {
    id: 'study-progress',
    icon: BookOpen,
    title: '푼 문제가 쌓여요',
    body: '스터디 자료의 연습 문제를 풀면 진도가 저장돼요. 저장은 이 브라우저에 되니, 같은 기기에서 이어서 풀어 보세요.',
    surface: 'learn',
    targets: [item('learn', '/study')],
  },
  {
    id: 'lab',
    icon: FlaskConical,
    title: 'Lab',
    body: '\'배움\' 메뉴의 회로 Lab에서 브라우저로 아두이노 회로를 만들고 코드를 바로 돌려 봐요.',
    surface: 'learn',
    targets: [item('learn', '/lab/')],
  },
  {
    id: 'appearance',
    icon: Palette,
    title: '화면 설정',
    body: '라이트와 다크 테마, 강조 색을 바꿀 수 있어요. 화면 맨 아래 \'화면 설정\'에서 열어요.',
    targets: ['[data-tour="appearance"]'],
  },
  QUESTIONS_STEP,
  {
    id: 'account',
    icon: UserRound,
    title: '계정 설정',
    body: "이름을 누르면 계정 설정이 열려요. 비밀번호와 알림 설정을 바꿀 수 있어요. 이 안내는 맨 아래 '튜토리얼 시작'에서 다시 볼 수 있어요.",
    targets: ['[data-tour="account"]'],
  },
]

export const TOUR_STEPS: Record<TourKind, TourStep[]> = { guest: GUEST_STEPS, member: MEMBER_STEPS }

const mobileSteps = (kind: TourKind): TourStep[] => [
  {
    id: 'menu-search',
    icon: Binary,
    title: '메뉴와 빠른 이동',
    body: '오른쪽 위 메뉴에서 동아리·배움·멤버·도구를 찾아요. 옆 돋보기를 누르면 원하는 페이지를 바로 검색할 수 있어요.',
    surface: 'menu',
    targets: [item('club', '/about')],
  },
  {
    id: 'study-lab',
    icon: BookOpen,
    title: '스터디 자료와 회로 Lab',
    body: kind === 'guest'
      ? '메뉴 > 배움 > 스터디 자료에서 과목과 장 제목을 볼 수 있어요. 강의 본문과 실습은 동아리원 로그인 후 열려요. 회로 Lab은 누구나 둘러볼 수 있고 코드 컴파일은 로그인한 동아리원에게 열려요.'
      : '메뉴 > 배움 > 스터디 자료에서 강의 본문을 읽고 문제를 풀어요. 같은 배움 메뉴의 회로 Lab에서는 아두이노 회로를 만들고 코드를 실행할 수 있어요.',
    surface: 'learn',
    targets: [item('learn', '/study'), item('learn', '/lab/')],
  },
  {
    id: 'works',
    icon: CircuitBoard,
    title: '부원들의 작품',
    body: kind === 'guest'
      ? '메뉴 > 도구 > 작품에서 부원들이 만든 앱과 서비스를 둘러봐요. 작품 상세에서 조회수, 추천, 댓글과 답글을 볼 수 있어요. 로그인한 부원은 작품을 올릴 수 있어요.'
      : '메뉴 > 도구 > 작품에서 다른 부원의 결과물을 보고 추천과 댓글·답글을 남겨요. 내 작품도 올리고 수정할 수 있어요.',
    surface: 'tools',
    targets: [item('tools', '/apps')],
  },
  {
    id: 'appearance',
    icon: Palette,
    title: '내 화면 꾸미기',
    body: '화면 맨 아래 화면 설정에서 인트로를 고르고 미리 보거나 화면 효과와 강조 색상을 바꿔요. 옆의 튜토리얼 시작으로 이 안내를 다시 볼 수 있어요.',
    targets: ['[data-tour="appearance"]'],
  },
  QUESTIONS_STEP,
  {
    id: 'account',
    icon: kind === 'guest' ? LogIn : UserRound,
    title: kind === 'guest' ? '동아리원으로 시작하기' : '내 계정 확인하기',
    body: kind === 'guest'
      ? '오른쪽 위 메뉴 > 로그인에서 동아리원 계정으로 들어가요. 화면 맨 아래 튜토리얼 시작을 누르면 언제든 다시 둘러볼 수 있어요.'
      : '오른쪽 위 메뉴 > 계정 설정에서 비밀번호와 알림을 관리해요. 화면 맨 아래 튜토리얼 시작을 누르면 언제든 다시 볼 수 있어요.',
    surface: 'account',
    targets: [kind === 'guest' ? '[data-tour="login"]' : '[data-tour="account"]'],
  },
]

export const MOBILE_TOUR_STEPS: Record<TourKind, TourStep[]> = {
  guest: mobileSteps('guest'),
  member: mobileSteps('member'),
}
