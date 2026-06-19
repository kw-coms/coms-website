import {
  Binary,
  CalendarDays,
  CircuitBoard,
  Rocket,
  Sparkles,
} from 'lucide-react'

export const tabs = [
  { id: 'about', label: 'About', hint: '정체성', icon: Binary, accent: 'text-cyan-200' },
  { id: 'activities', label: 'Activities', hint: '세미나·스터디', icon: Sparkles, accent: 'text-rose-200' },
  { id: 'projects', label: 'Projects', hint: '실전 제작', icon: CircuitBoard, accent: 'text-violet-200' },
  { id: 'recruit', label: 'Recruit', hint: '지원 안내', icon: Rocket, accent: 'text-sky-500' },
]

export const activityDetails = [
  {
    title: '정기 세미나',
    description: '프로그래밍 기초, 웹 개발, 알고리즘, 컴퓨터 구조처럼 학기 중 꾸준히 다루기 좋은 주제를 정해 함께 학습합니다.',
  },
  {
    title: '수준별 스터디',
    description: '처음 시작하는 부원은 기초 문법과 개발 환경부터 익히고, 기존 부원은 관심 분야별로 심화 스터디를 운영합니다.',
  },
  {
    title: '팀 프로젝트',
    description: '웹사이트, 앱, 아두이노, 자동화 도구 등 실제로 사용할 수 있는 결과물을 목표로 기획부터 구현까지 경험합니다.',
  },
  {
    title: '선후배 교류',
    description: '수강 과목, 공모전, 진로, 개발 학습 방법에 대한 경험을 공유하며 서로의 성장을 돕는 커뮤니티를 만듭니다.',
  },
]

export const projectDetails = [
  {
    title: 'COM\'s Official Website',
    description: '동아리 소개, 공지사항, 자료실, 커뮤니티를 담는 공식 웹사이트입니다. React, Vite, Tailwind CSS를 활용해 실제 서비스 형태로 개발합니다.',
  },
  {
    title: 'Arduino Basic Class',
    description: '아두이노를 처음 접하는 부원을 위해 회로 연결, 센서 입력, 간단한 제어 로직을 단계별로 익히는 교육형 프로젝트입니다.',
  },
  {
    title: 'Web Development Study',
    description: 'HTML, CSS, JavaScript, React를 기반으로 화면 설계와 컴포넌트 구현을 연습하고, 작은 기능을 직접 완성해 봅니다.',
  },
  {
    title: '자유 주제 제작',
    description: '부원들이 관심 있는 아이디어를 팀으로 발전시켜 웹 서비스, 앱, 자동화 프로그램, 학습 도구 등 다양한 결과물을 제작합니다.',
  },
]

export const heroHighlights = [
  { label: 'Weekly', value: 'Seminar', detail: '기초와 심화가 이어지는 학습 루틴' },
  { label: 'Team', value: 'Project', detail: '아이디어를 실제 서비스로 제작' },
  { label: 'Campus', value: 'Network', detail: '선후배가 함께 나누는 개발 경험' },
]

export const experiencePills = ['Beginner friendly', 'React · Vite', 'Arduino', 'Study archive', 'Community']

export const showcaseItems = [
  {
    eyebrow: 'Learn',
    title: '학습 흐름을 한눈에.',
    body: '정기 세미나, 수준별 스터디, 자료실이 하나의 흐름으로 이어집니다.',
    target: 'activities',
  },
  {
    eyebrow: 'Build',
    title: '만들면서 성장.',
    body: '웹사이트와 교육 프로젝트를 통해 실제로 쓰이는 결과물을 완성합니다.',
    target: 'projects',
  },
  {
    eyebrow: 'Join',
    title: '처음이어도 괜찮게.',
    body: '개발 경험이 적어도 함께 따라올 수 있는 활동 구조를 만듭니다.',
    target: 'recruit',
  },
]

export const activityHubItems = [
  {
    title: '공지사항',
    body: '모집, 세미나, 운영 안내를 빠르게 확인합니다.',
    route: '/notices',
    cta: '공지 보기',
  },
  {
    title: '커뮤니티',
    body: '질문, 프로젝트 모집, 활동 후기를 부원들과 나눕니다.',
    route: '/community',
    cta: '커뮤니티 열기',
  },
  {
    title: '자료실',
    body: '세미나 자료와 프로젝트 기록을 다시 찾아봅니다.',
    route: '/resources',
    cta: '자료 찾기',
  },
]

export const companionServices = [
  {
    title: 'COMS 월드컵',
    eyebrow: 'Worldcup',
    body: '둘 중 하나를 고르며 개발 언어, 야식, 밈, 세미나 주제의 최종 우승자를 뽑는 COMS 미니게임입니다.',
    href: 'https://coms.kw.ac.kr/worldcup/',
    domain: 'coms.kw.ac.kr/worldcup',
  },
  {
    title: 'COMS 티어표',
    eyebrow: 'Tier board',
    body: '언어, 프레임워크, 프로젝트, 활동 주제를 S/A/B/C/D로 나누고 공유하는 COMS 티어표 도구입니다.',
    href: 'https://coms.kw.ac.kr/tier/',
    domain: 'coms.kw.ac.kr/tier',
  },
  {
    title: 'Food Club',
    eyebrow: 'Meal loop',
    body: '부원들과 밥 약속과 맛집 후보를 가볍게 모으는 식사 모임 허브입니다.',
    href: 'https://coms.kw.ac.kr/foodclub/',
    domain: 'coms.kw.ac.kr/foodclub',
  },
  {
    title: 'TeamMate',
    eyebrow: 'Team randomizer',
    body: '스터디와 프로젝트 팀을 조건에 맞춰 빠르게 나누는 팀 편성 도구입니다.',
    href: 'https://coms.kw.ac.kr/team-randomizer/',
    domain: 'coms.kw.ac.kr/team-randomizer',
  },
  {
    title: 'Game Club',
    eyebrow: 'Playground',
    body: '동아리 안에서 함께 즐길 수 있는 작은 게임과 이벤트 공간입니다.',
    href: 'https://coms.kw.ac.kr/gameclub/',
    domain: 'coms.kw.ac.kr/gameclub',
  },
  {
    title: 'KW Mate',
    eyebrow: 'Campus utility',
    body: '광운대 생활에 필요한 연결과 정보를 더 쉽게 찾도록 돕는 서비스입니다.',
    href: 'http://kwmate.com/',
    domain: 'kwmate.com',
  },
  {
    title: 'Daily Coding',
    eyebrow: 'Practice',
    body: '매일 코딩 문제와 기록을 이어가며 학습 루틴을 만드는 연습 공간입니다.',
    href: 'https://dailycoding-final.com/',
    domain: 'dailycoding-final.com',
  },
]

export const sectionMetrics = {
  about: [
    { value: 'Central', label: '광운대 중앙 동아리' },
    { value: 'Build', label: '팀 제작 중심 활동' },
    { value: 'Share', label: '선후배 경험 공유' },
  ],
  activities: [
    { value: '01', label: '기초 세미나' },
    { value: '02', label: '수준별 스터디' },
    { value: '03', label: '팀 프로젝트' },
  ],
  projects: [
    { value: 'Web', label: '공식 웹사이트' },
    { value: 'IoT', label: '아두이노 교육' },
    { value: 'App', label: '자유 제작' },
  ],
  recruit: [
    { value: 'Step 1', label: '지원서 작성' },
    { value: 'Step 2', label: '내부 확인' },
    { value: 'Step 3', label: '정기 활동' },
  ],
}

export const visualDetails = {
  about: {
    title: 'Club OS',
    subtitle: 'Study · Build · Share',
    rows: ['학습 로드맵', '프로젝트 트랙', '커뮤니티 로그'],
    accent: 'var(--app-accent)',
  },
  activities: {
    title: 'Learning Stack',
    subtitle: 'Seminar · Study · Review',
    rows: ['기초 세미나', '분야별 스터디', '코드 리뷰'],
    accent: 'var(--app-accent)',
  },
  projects: {
    title: 'Project Lab',
    subtitle: 'Prototype · Launch · Iterate',
    rows: ['서비스 기획', '프론트엔드 구현', '배포와 개선'],
    accent: 'var(--app-accent)',
  },
  recruit: {
    title: 'Join Flow',
    subtitle: 'Apply · Meet · Start',
    rows: ['지원서 제출', '개별 안내', '오리엔테이션'],
    accent: 'var(--app-accent)',
  },
}

export const sectionMeta = {
  about: {
    eyebrow: 'About COM\'s',
    background: '#ffffff',
    visual: 'linear-gradient(135deg, #e8f8ff, #f5f5f7 55%, #ffffff)',
  },
  activities: {
    eyebrow: 'Activities',
    background: '#f5f5f7',
    visual: 'linear-gradient(135deg, #fff1f4, #eef5ff)',
  },
  projects: {
    eyebrow: 'Projects',
    background: '#ffffff',
    visual: 'linear-gradient(135deg, #edf2ff, #f7f0ff)',
  },
  recruit: {
    eyebrow: 'Recruit',
    background: '#f5f5f7',
    visual: 'linear-gradient(135deg, #e8f3ff, #f5f5f7 60%, #ffffff)',
  },
}

export const sectionStories = {
  about: {
    title: '광운대에서 컴퓨터를 가장 자연스럽게 시작하는 곳.',
    body: 'COM\'s는 세미나, 스터디, 프로젝트, 커뮤니티가 하나의 흐름으로 이어지는 중앙 컴퓨터 학술동아리입니다. 처음 배우는 사람도, 이미 만들고 있는 사람도 각자의 속도로 합류할 수 있습니다.',
    primary: 'About 더 알아보기',
    secondary: '활동 보기',
  },
  activities: {
    title: '기초부터 실전까지, 매주 이어지는 학습 루틴.',
    body: '정기 세미나와 수준별 스터디로 기초를 쌓고, 코드 리뷰와 작은 제작 과제로 배운 내용을 바로 손에 익힙니다.',
    primary: '활동 더 보기',
    secondary: '프로젝트 보기',
  },
  projects: {
    title: '아이디어를 실제 서비스와 제작물로.',
    body: '공식 웹사이트, 아두이노 교육, 웹 개발 스터디처럼 동아리 안에서 쓰이고 남는 결과물을 함께 설계하고 배포합니다.',
    primary: '프로젝트 더 보기',
    secondary: 'GitHub 열기',
  },
  recruit: {
    title: '함께 배울 다음 멤버를 기다립니다.',
    body: '전공이나 개발 경험보다 중요한 것은 꾸준히 배우고 만들어 보려는 마음입니다. 지원서는 로그인 없이 제출할 수 있고, 운영진 확인 후 개별 안내가 진행됩니다.',
    primary: '지원서 작성하기',
    secondary: '모집 공지 보기',
  },
}

export const aboutDetailCards = [
  {
    title: 'Study',
    eyebrow: '기초에서 확장까지',
    body: '처음 배우는 사람도 따라올 수 있도록 정기 세미나와 스터디를 운영하고, 각자의 속도에 맞춰 실습과 리뷰를 이어갑니다.',
    icon: Binary,
  },
  {
    title: 'Build',
    eyebrow: '아이디어를 실제 결과물로',
    body: '웹, 임베디드, 자동화, 동아리 서비스처럼 손에 잡히는 프로젝트를 기획하고 직접 구현합니다.',
    icon: CircuitBoard,
  },
  {
    title: 'Share',
    eyebrow: '경험이 다음 사람에게',
    body: '선후배가 배운 것과 시행착오를 공유하면서 커뮤니티 안에 오래 남는 학습 기록을 만듭니다.',
    icon: Sparkles,
  },
]

export const aboutDetailFlow = [
  ['01', 'Learn together', '세미나와 스터디로 개발의 기본기를 함께 쌓습니다.'],
  ['02', 'Make it real', '작은 실습을 프로젝트로 확장하며 결과물을 완성합니다.'],
  ['03', 'Grow the community', '후기, 코드 리뷰, 자료 공유로 다음 활동의 기준을 높입니다.'],
]

export const aboutDetailPrinciples = [
  '처음 시작하는 사람도 편하게 질문할 수 있는 분위기',
  '작게 만들고 빠르게 공유하며 개선하는 제작 문화',
  '동아리 밖에서도 이어지는 개발 경험과 포트폴리오',
]

export const activitiesDetailCards = [
  {
    title: '정기 세미나',
    eyebrow: 'Weekly seminar',
    body: '프로그래밍 기초, 웹 개발, 알고리즘, 컴퓨터 구조처럼 학기 중 꾸준히 다룰 주제를 정해 함께 학습합니다.',
    icon: Binary,
  },
  {
    title: '분야별 스터디',
    eyebrow: 'Focused study',
    body: '처음 시작하는 부원부터 기존 부원까지 각자 관심 분야에 맞춰 프론트엔드, 백엔드, 임베디드, 알고리즘 등을 나눠 공부합니다.',
    icon: Sparkles,
  },
  {
    title: '코드 리뷰',
    eyebrow: 'Review loop',
    body: '스터디와 프로젝트에서 작성한 코드를 공유하고, 더 읽기 좋은 구조와 협업 방식을 함께 익힙니다.',
    icon: CircuitBoard,
  },
]

export const activitiesDetailFlow = [
  ['01', '기초를 맞춥니다', '새로운 주제를 시작하기 전 필요한 개념을 함께 정리하고, 따라올 수 있는 기준을 맞춥니다.'],
  ['02', '작게 실습합니다', '배운 내용을 작은 과제와 예제로 바로 적용하면서 손으로 익히는 시간을 만듭니다.'],
  ['03', '서로 설명합니다', '모르는 지점을 질문하고, 이해한 내용을 다시 설명하며 학습을 오래 남깁니다.'],
  ['04', '프로젝트로 연결합니다', '활동에서 배운 내용이 실제 제작과 포트폴리오로 이어지도록 프로젝트 주제를 찾습니다.'],
]

export const activitiesDetailTopics = [
  'HTML, CSS, JavaScript, React 기반 웹 개발',
  'C, Python, Java 등 프로그래밍 기초와 문제 해결',
  'Arduino와 센서를 활용한 임베디드 실습',
  'Git, GitHub, 협업 도구를 활용한 팀 개발',
  '공모전, 해커톤, 개인 프로젝트 준비',
]

export const calendarWeekdays = ['월', '화', '수', '목', '금', '토', '일']
export const calendarMonthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: `${index + 1}월`,
}))

export const clubActivityCategories = [
  ['GENERAL', '일반'],
  ['SEMINAR', '세미나'],
  ['STUDY', '스터디'],
  ['PROJECT', '프로젝트'],
  ['MEETING', '회의'],
  ['RECRUIT', '모집'],
  ['EVENT', '행사'],
  ['MT', 'MT'],
  ['ACHIEVEMENT', '성과'],
]

export const projectsDetailCards = [
  {
    title: 'Official Website',
    eyebrow: 'Service project',
    body: '동아리 소개, 공지사항, 자료실, 커뮤니티를 담는 공식 웹사이트를 실제 서비스 형태로 개발하고 개선합니다.',
    icon: CircuitBoard,
  },
  {
    title: 'Arduino Class',
    eyebrow: 'Hardware lab',
    body: '초급자를 위한 아두이노 기초 교육을 통해 센서 입력, 회로 연결, 간단한 제어 로직을 단계별로 익힙니다.',
    icon: Binary,
  },
  {
    title: 'Web Study Build',
    eyebrow: 'Frontend track',
    body: 'HTML, CSS, JavaScript, React를 기반으로 화면 설계와 컴포넌트 구현을 연습하고 작은 기능을 직접 완성합니다.',
    icon: Sparkles,
  },
]

export const projectsDetailFlow = [
  ['01', '문제를 정합니다', '동아리 안팎에서 필요한 기능이나 만들고 싶은 아이디어를 모아 프로젝트 주제로 정리합니다.'],
  ['02', '역할을 나눕니다', '기획, 디자인, 프론트엔드, 백엔드, 하드웨어 등 필요한 역할을 나누고 협업 방식을 정합니다.'],
  ['03', '작게 출시합니다', '완벽한 완성보다 사용 가능한 첫 버전을 빠르게 만들고 실제 피드백을 받습니다.'],
  ['04', '계속 개선합니다', '코드 리뷰와 회고를 통해 다음 프로젝트에서 더 좋은 구조와 경험을 가져갑니다.'],
]

export const projectsDetailOutputs = [
  'COM\'s 공식 웹사이트와 운영 도구',
  '아두이노 기초 교육용 실습 예제',
  '웹 개발 스터디 결과물과 개인 포트폴리오',
  '공모전, 해커톤, 자유 주제 제작물',
  '동아리 자료실과 커뮤니티 개선 기능',
]

export const accentSwatches = [
  { name: 'Apple Blue', value: '#0071e3' },
  { name: 'Graphite', value: '#3c3c43' },
  { name: 'Rose', value: '#d70015' },
  { name: 'Amber', value: '#ff9f0a' },
  { name: 'Violet', value: '#8e5cf7' },
]

export const footerLinkGroups = [
  {
    title: "COM's",
    links: [
      { label: 'About', href: '/about' },
      { label: 'Activities', href: '/activities' },
      { label: 'Projects', href: '/projects' },
      { label: 'Recruit', href: '/recruit' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'Notices', href: '/notices' },
      { label: 'Community', href: '/community' },
      { label: 'Archive', href: '/resources' },
      { label: 'Admin', href: '/admin' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { label: 'Instagram', href: 'https://www.instagram.com/kw_coms', external: true },
      { label: 'GitHub', href: 'https://github.com/kw-coms', external: true },
      { label: 'YouTube', href: 'https://www.youtube.com/@kw_coms', external: true },
      { label: 'Mail', href: 'mailto:kwcoms69@gmail.com' },
    ],
  },
]

export const navExtraItems = [
  { id: 'notices', label: 'Notices', path: '/notices' },
  { id: 'resources', label: 'Resources', path: '/resources', auth: true },
  { id: 'community', label: 'Community', path: '/community', auth: true },
]

export const activitySectionNavItems = [
  {
    id: 'activity-log',
    label: 'Activity log',
    hint: '활동 기록',
    path: '/activity-log',
    icon: Sparkles,
    accent: 'text-rose-400',
  },
  {
    id: 'monthly-calendar',
    label: 'Monthly calendar',
    hint: '월별 일정',
    path: '/monthly-calendar',
    icon: CalendarDays,
    accent: 'text-sky-500',
  },
]
