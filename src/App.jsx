import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  Binary,
  Bell,
  CalendarDays,
  ChevronDown,
  CircuitBoard,
  Grid3x3,
  LogOut,
  Menu,
  Megaphone,
  Moon,
  Rocket,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { listNotices } from './services/noticeApi.js'
import { createClubActivity, listClubActivities } from './services/clubActivityApi.js'
import { getNotificationSummary, listNotifications, markAllNotificationsRead, markNotificationRead } from './services/notificationApi.js'
import { listFonts } from './services/fontApi.js'
import { BUILT_IN_FONTS, buildFontFaceCss, fontFamilyValue, injectBuiltinFontStylesheets } from './services/fontPreferences.js'
const Archive = lazy(() => import('./pages/Archive.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Signup = lazy(() => import('./pages/Signup.jsx'))
const Notices = lazy(() => import('./pages/Notices.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Community = lazy(() => import('./pages/Community.jsx'))
const ChangePassword = lazy(() => import('./pages/ChangePassword.jsx'))
const RecruitApply = lazy(() => import('./pages/RecruitApply.jsx'))
const RecruitNotice = lazy(() => import('./pages/RecruitNotice.jsx'))
import { getLogoAsset } from './utils/logoAssets.js'
import { useAuth } from './contexts/useAuth.js'

const tabs = [
  { id: 'about', label: 'About', hint: '정체성', icon: Binary, accent: 'text-cyan-200' },
  { id: 'activities', label: 'Activities', hint: '세미나·스터디', icon: Sparkles, accent: 'text-rose-200' },
  { id: 'projects', label: 'Projects', hint: '실전 제작', icon: CircuitBoard, accent: 'text-violet-200' },
  { id: 'recruit', label: 'Recruit', hint: '지원 안내', icon: Rocket, accent: 'text-sky-500' },
]

const activityDetails = [
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

const projectDetails = [
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

const heroHighlights = [
  { label: 'Weekly', value: 'Seminar', detail: '기초와 심화가 이어지는 학습 루틴' },
  { label: 'Team', value: 'Project', detail: '아이디어를 실제 서비스로 제작' },
  { label: 'Campus', value: 'Network', detail: '선후배가 함께 나누는 개발 경험' },
]

const experiencePills = ['Beginner friendly', 'React · Vite', 'Arduino', 'Study archive', 'Community']

const showcaseItems = [
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

const activityHubItems = [
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

const companionServices = [
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

const sectionMetrics = {
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

const visualDetails = {
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

const sectionMeta = {
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

const sectionStories = {
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

const floatingBarBaseClass = 'apple-topbar border-b border-black/10'
const solidActionBtnClass = 'apple-action-primary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'
const ghostActionBtnClass = 'apple-action-secondary inline-flex min-h-10 items-center justify-center px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60'
const DETAIL_TITLE_MIN_FIT = 0.74

const aboutDetailCards = [
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

const aboutDetailFlow = [
  ['01', 'Learn together', '세미나와 스터디로 개발의 기본기를 함께 쌓습니다.'],
  ['02', 'Make it real', '작은 실습을 프로젝트로 확장하며 결과물을 완성합니다.'],
  ['03', 'Grow the community', '후기, 코드 리뷰, 자료 공유로 다음 활동의 기준을 높입니다.'],
]

const aboutDetailPrinciples = [
  '처음 시작하는 사람도 편하게 질문할 수 있는 분위기',
  '작게 만들고 빠르게 공유하며 개선하는 제작 문화',
  '동아리 밖에서도 이어지는 개발 경험과 포트폴리오',
]

const activitiesDetailCards = [
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

const activitiesDetailFlow = [
  ['01', '기초를 맞춥니다', '새로운 주제를 시작하기 전 필요한 개념을 함께 정리하고, 따라올 수 있는 기준을 맞춥니다.'],
  ['02', '작게 실습합니다', '배운 내용을 작은 과제와 예제로 바로 적용하면서 손으로 익히는 시간을 만듭니다.'],
  ['03', '서로 설명합니다', '모르는 지점을 질문하고, 이해한 내용을 다시 설명하며 학습을 오래 남깁니다.'],
  ['04', '프로젝트로 연결합니다', '활동에서 배운 내용이 실제 제작과 포트폴리오로 이어지도록 프로젝트 주제를 찾습니다.'],
]

const activitiesDetailTopics = [
  'HTML, CSS, JavaScript, React 기반 웹 개발',
  'C, Python, Java 등 프로그래밍 기초와 문제 해결',
  'Arduino와 센서를 활용한 임베디드 실습',
  'Git, GitHub, 협업 도구를 활용한 팀 개발',
  '공모전, 해커톤, 개인 프로젝트 준비',
]

const calendarWeekdays = ['월', '화', '수', '목', '금', '토', '일']

function buildCalendarMonth(referenceDate = new Date()) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = (firstDay.getDay() + 6) % 7
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7
  return {
    title: `${year}년 ${month + 1}월`,
    year,
    month,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    leadingBlanks,
    trailingBlanks,
  }
}

function parseLocalDate(value) {
  if (typeof value !== 'string') return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatActivityDate(value) {
  const date = parseLocalDate(value)
  if (!date) return value || ''
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function categoryLabel(value) {
  const labels = {
    GENERAL: '일반',
    SEMINAR: '세미나',
    STUDY: '스터디',
    PROJECT: '프로젝트',
    MEETING: '회의',
    RECRUIT: '모집',
    EVENT: '행사',
    MT: 'MT',
    ACHIEVEMENT: '성과',
  }
  return labels[value] || value || '일반'
}

const clubActivityCategories = [
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

const projectsDetailCards = [
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

const projectsDetailFlow = [
  ['01', '문제를 정합니다', '동아리 안팎에서 필요한 기능이나 만들고 싶은 아이디어를 모아 프로젝트 주제로 정리합니다.'],
  ['02', '역할을 나눕니다', '기획, 디자인, 프론트엔드, 백엔드, 하드웨어 등 필요한 역할을 나누고 협업 방식을 정합니다.'],
  ['03', '작게 출시합니다', '완벽한 완성보다 사용 가능한 첫 버전을 빠르게 만들고 실제 피드백을 받습니다.'],
  ['04', '계속 개선합니다', '코드 리뷰와 회고를 통해 다음 프로젝트에서 더 좋은 구조와 경험을 가져갑니다.'],
]

const projectsDetailOutputs = [
  'COM\'s 공식 웹사이트와 운영 도구',
  '아두이노 기초 교육용 실습 예제',
  '웹 개발 스터디 결과물과 개인 포트폴리오',
  '공모전, 해커톤, 자유 주제 제작물',
  '동아리 자료실과 커뮤니티 개선 기능',
]

const DEFAULT_ACCENT = '#0071e3'
const THEME_MODE_KEY = 'kwcoms-theme-mode'
const ACCENT_COLOR_KEY = 'kwcoms-accent-color'
const FONT_SELECTION_KEY = 'kwcoms-font-id'

function getStoredFontId() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(FONT_SELECTION_KEY)
  if (!raw) return null
  if (raw.startsWith('b:')) return raw
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

const accentSwatches = [
  { name: 'Apple Blue', value: '#0071e3' },
  { name: 'Graphite', value: '#3c3c43' },
  { name: 'Rose', value: '#d70015' },
  { name: 'Amber', value: '#ff9f0a' },
  { name: 'Violet', value: '#8e5cf7' },
]

const footerLinkGroups = [
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

const navExtraItems = [
  { id: 'notices', label: 'Notices', path: '/notices' },
  { id: 'resources', label: 'Resources', path: '/resources', auth: true },
  { id: 'community', label: 'Community', path: '/community', auth: true },
]

const activitySectionNavItems = [
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

function getTabRoute(id) {
  return id === 'recruit' ? '/recruit' : `/${id}`
}

function getActiveNavKey(pathname) {
  if (pathname === '/about') return 'about'
  if (pathname === '/activities') return 'activities'
  if (pathname === '/activity-log') return 'activity-log'
  if (pathname === '/monthly-calendar') return 'monthly-calendar'
  if (pathname === '/projects') return 'projects'
  if (pathname === '/apps') return 'apps'
  if (pathname.startsWith('/recruit')) return 'recruit'
  if (pathname.startsWith('/notices')) return 'notices'
  if (pathname.startsWith('/resources')) return 'resources'
  if (pathname.startsWith('/community')) return 'community'
  return null
}

function normalizeHex(value) {
  if (typeof value !== 'string') return DEFAULT_ACCENT
  const trimmed = value.trim()
  const shorthand = /^#?([0-9a-f]{3})$/i.exec(trimmed)
  if (shorthand) {
    return `#${shorthand[1].split('').map((char) => char + char).join('').toLowerCase()}`
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(trimmed)
  return full ? `#${full[1].toLowerCase()}` : DEFAULT_ACCENT
}

function hexToRgb(hex) {
  const value = normalizeHex(hex).slice(1)
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

function mixHex(base, overlay, overlayRatio) {
  const baseRgb = hexToRgb(base)
  const overlayRgb = hexToRgb(overlay)
  const ratio = Math.min(Math.max(overlayRatio, 0), 1)
  return rgbToHex({
    r: baseRgb.r * (1 - ratio) + overlayRgb.r * ratio,
    g: baseRgb.g * (1 - ratio) + overlayRgb.g * ratio,
    b: baseRgb.b * (1 - ratio) + overlayRgb.b * ratio,
  })
}

function getStoredThemeMode() {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_MODE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredAccentColor() {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  return normalizeHex(window.localStorage.getItem(ACCENT_COLOR_KEY) || DEFAULT_ACCENT)
}

function scrollToTopInstant() {
  if (typeof window === 'undefined') return
  const root = document.documentElement
  const previousBehavior = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  root.style.scrollBehavior = previousBehavior
}

// ─── Auth guards ───────────────────────────────────────────────────────────

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    scrollToTopInstant()
  }, [pathname])

  return null
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-black/10 bg-white/82 p-8 text-center text-[#6e6e73] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-black/10 bg-white/82 p-8 text-center text-[#6e6e73] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

// ─── Page route wrappers ────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromLocation = location.state?.from
  const successPath = fromLocation
    ? `${fromLocation.pathname || '/'}${fromLocation.search || ''}${fromLocation.hash || ''}`
    : '/'
  return (
    <PageShell>
      <Login
        onCancel={() => navigate('/', { replace: true })}
        onSuccess={() => navigate(successPath, { replace: true })}
        goSignup={() => navigate('/signup')}
      />
    </PageShell>
  )
}

function SignupPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Signup onBack={() => navigate('/login')} />
    </PageShell>
  )
}

function NoticesPage() {
  return (
    <PageShell wide full>
      <Notices />
    </PageShell>
  )
}

function ArchivePage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Archive onBack={() => navigate('/')} />
    </PageShell>
  )
}

function CommunityPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full>
      <Community onBack={() => navigate('/')} />
    </PageShell>
  )
}

function AdminPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <Admin onBack={() => navigate('/')} />
    </PageShell>
  )
}

function SettingsPage() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <ChangePassword onBack={() => navigate('/')} />
    </PageShell>
  )
}

function RecruitPage() {
  const navigate = useNavigate()
  return (
    <PageShell wide full transition={false}>
      <RecruitApply onBack={() => navigate('/')} />
    </PageShell>
  )
}

function RecruitNoticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'
  const goApply = () => {
    scrollToTopInstant()
    navigate('/recruit')
  }

  return (
    <PageShell wide full transition={false}>
      <RecruitNotice onBack={() => navigate(from, { replace: true })} onApply={goApply} />
    </PageShell>
  )
}

function GlobalNavigation() {
  const { user, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false)
  const activityWrapperRef = useRef(null)
  const activeKey = getActiveNavKey(location.pathname)
  const mobileTabs = tabs.slice(0, 3)
  const showMobileTabs = mobileTabs.some((tab) => tab.id === activeKey)
  const primaryNavItems = tabs.map((tab) => ({ ...tab, path: getTabRoute(tab.id) }))
  const noticesNavItem = navExtraItems.find((item) => item.id === 'notices')
  const memberNavItems = navExtraItems.filter((item) => item.id !== 'notices')
  const activityNavActive = activitySectionNavItems.some((item) => item.id === activeKey)

  useEffect(() => {
    if (!activityOpen) return undefined
    const onDocClick = (event) => {
      if (activityWrapperRef.current && !activityWrapperRef.current.contains(event.target)) setActivityOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setActivityOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [activityOpen])

  useEffect(() => {
    if (!location.hash) return undefined
    const sectionId = decodeURIComponent(location.hash.slice(1))
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash, location.pathname])

  const goPageTop = (to, options) => {
    scrollToTopInstant()
    navigate(to, options)
  }

  const closeAndGo = (to, options) => {
    setMobileMenuOpen(false)
    setMobileActivityOpen(false)
    goPageTop(to, options)
  }

  const goProtected = (to) => {
    if (authLoading) return
    closeAndGo(to)
  }

  const goNavItem = (item) => {
    const target = `${item.path}${item.hash || ''}`
    setActivityOpen(false)
    if (item.auth) {
      goProtected(target)
      return
    }
    goPageTop(target)
  }

  const handleLogout = async () => {
    await logout()
    setMobileMenuOpen(false)
    goPageTop('/')
  }

  const navClass = (key, active = activeKey === key) => (
    `relative px-1 text-xs font-semibold transition ${
      active
        ? 'text-[var(--app-text)]'
        : 'text-[var(--app-muted)] hover:text-[var(--app-text)]'
    }`
  )

  return (
    <header className="apple-global-nav fixed inset-x-0 top-0 z-[80]">
      <div className={`${floatingBarBaseClass} relative mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8`}>
        <button
          type="button"
          onClick={() => goPageTop('/')}
          className="apple-global-nav-brand flex min-w-0 items-center gap-3 text-left"
          aria-label="홈으로 이동"
        >
          <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="h-6 w-6 shrink-0 object-contain" />
          <span className="whitespace-nowrap text-sm font-bold text-[var(--app-text)]">KW COM&apos;s</span>
        </button>

        <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-3 lg:gap-5 md:flex">
          {primaryNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goNavItem(item)}
              className={`${navClass(item.id)} disabled:cursor-wait disabled:opacity-60`}
            >
              {item.label}
              <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === item.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
          {noticesNavItem && (
            <button
              type="button"
              onClick={() => goNavItem(noticesNavItem)}
              className={navClass(noticesNavItem.id)}
            >
              {noticesNavItem.label}
              <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === noticesNavItem.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          )}
          <div ref={activityWrapperRef} className="relative">
            <button
              type="button"
              onClick={() => setActivityOpen((open) => !open)}
              className={`${navClass('activity', activityNavActive)} inline-flex items-center gap-1`}
              aria-haspopup="menu"
              aria-expanded={activityOpen}
            >
              Activity
              <ChevronDown size={12} className={`transition ${activityOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {activityOpen && (
              <div
                role="menu"
                className="absolute left-1/2 top-full z-[90] mt-4 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.12)]"
              >
                <div className="border-b border-black/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#86868b]">Activity</p>
                  <p className="text-sm font-semibold text-[#1d1d1f]">기록과 일정</p>
                </div>
                <ul className="flex flex-col py-1">
                  {activitySectionNavItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => goNavItem(item)}
                        className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-[#f5f5f7]"
                      >
                        <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[#0066cc]">
                          <item.icon size={14} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-left text-sm font-semibold text-[#1d1d1f]">{item.label}</span>
                          <span className="block text-left text-xs font-medium text-[#86868b]">{item.hint}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {memberNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goNavItem(item)}
              disabled={item.auth && authLoading}
              className={`${navClass(item.id)} disabled:cursor-wait disabled:opacity-60`}
            >
              {item.label}
              <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === item.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
          <button type="button" onClick={() => goPageTop('/apps')} className={navClass('apps', activeKey === 'apps')}>
            Apps
            <span className={`absolute -bottom-4 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[var(--app-accent)] transition ${activeKey === 'apps' ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        </nav>

        {user ? (
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <NotificationButton />
            <button type="button" onClick={() => goPageTop('/settings')} className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-black/5 hover:text-[var(--app-text)]" title="계정 설정">{user.name}</button>
            {user.role === 'ADMIN' && (
              <button type="button" onClick={() => goPageTop('/admin')} className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#b45309] transition hover:bg-amber-100/70">관리자</button>
            )}
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-black/5 hover:text-[var(--app-text)]">
              <LogOut size={14} />
              Logout
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => goPageTop('/login')}
            disabled={authLoading}
            className="ml-auto hidden shrink-0 whitespace-nowrap rounded-full bg-[var(--app-accent)] px-4 py-1 text-xs font-semibold text-white transition hover:bg-[var(--app-accent-hover)] disabled:cursor-wait disabled:opacity-70 md:inline-flex"
          >
            로그인
          </button>
        )}

        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="apple-global-nav-menu md:hidden"
          aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          aria-haspopup="menu"
        >
          {mobileMenuOpen ? <X size={21} strokeWidth={2.1} /> : <Menu size={22} strokeWidth={2.25} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          role="menu"
          className="apple-mobile-menu-panel mx-auto md:hidden"
        >
          <div className="flex flex-col divide-y divide-[var(--app-hairline)]">
            {primaryNavItems.map((item) => (
              <button key={item.id} type="button" onClick={() => closeAndGo(`${item.path}${item.hash || ''}`)} className="apple-mobile-menu-item">
                <item.icon size={15} className={item.accent} />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-[var(--app-muted)]">{item.hint}</span>
              </button>
            ))}
            <button type="button" onClick={() => closeAndGo('/notices')} className="apple-mobile-menu-item">
              <Megaphone size={15} className="text-cyan-500" />
              <span>Notices</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">공지사항</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileActivityOpen((open) => !open)}
              aria-expanded={mobileActivityOpen}
              aria-controls="mobile-activity-panel"
              className="apple-mobile-menu-item"
            >
              <CalendarDays size={15} className="text-sky-500" />
              <span>Activity</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--app-muted)]">
                기록·일정
                <ChevronDown
                  size={14}
                  className={`transition ${mobileActivityOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {mobileActivityOpen && (
              <div id="mobile-activity-panel" className="flex flex-col divide-y divide-[var(--app-hairline)] bg-black/[0.015]">
                {activitySectionNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => closeAndGo(item.path)}
                    className="flex items-start gap-3 px-6 py-3 text-left transition hover:bg-black/[0.03]"
                  >
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[#0066cc]">
                      <item.icon size={13} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--app-text)]">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--app-muted)]">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => goProtected('/resources')} disabled={authLoading} className="apple-mobile-menu-item disabled:opacity-50">
              <CircuitBoard size={15} className="text-violet-400" />
              <span>Resources</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">자료실</span>
            </button>
            <button type="button" onClick={() => goProtected('/community')} disabled={authLoading} className="apple-mobile-menu-item disabled:opacity-50">
              <Sparkles size={15} className="text-rose-400" />
              <span>Community</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">커뮤니티</span>
            </button>
            <button
              type="button"
              onClick={() => closeAndGo('/apps')}
              className="apple-mobile-menu-item"
            >
              <Grid3x3 size={15} className="text-sky-500" />
              <span>Apps</span>
              <span className="ml-auto text-xs text-[var(--app-muted)]">서비스</span>
            </button>
            {!user && (
              <button type="button" onClick={() => closeAndGo('/login')} disabled={authLoading} className="apple-mobile-menu-item apple-mobile-menu-item-accent disabled:opacity-50">
                <span>로그인</span>
              </button>
            )}
            {user && (
              <div className="border-t border-[var(--app-hairline)]">
                <div className="flex flex-col divide-y divide-[var(--app-hairline)]">
                  <button type="button" onClick={() => closeAndGo('/settings')} className="apple-mobile-menu-item">
                    <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-[10px] font-black">{user.name?.[0] ?? '?'}</span>
                    <span>{user.name}</span>
                    <span className="ml-auto text-xs text-[var(--app-muted)]">계정 설정</span>
                  </button>
                  {user.role === 'ADMIN' && (
                    <button type="button" onClick={() => closeAndGo('/admin')} className="apple-mobile-menu-item apple-mobile-menu-item-warning">
                      <span>관리자 패널</span>
                    </button>
                  )}
                  <NotificationButton alignLeft variant="mobileMenu" />
                  <button type="button" onClick={handleLogout} className="apple-mobile-menu-item">
                    <LogOut size={15} />
                    <span>로그아웃</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showMobileTabs && (
        <nav className="apple-mobile-tabs md:hidden" aria-label="상세 화면 이동">
          {mobileTabs.map((tab) => {
            const active = activeKey === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => closeAndGo(getTabRoute(tab.id))}
                className={`apple-mobile-tab ${active ? 'apple-mobile-tab-active' : ''}`}
              >
                {tab.label}
                <span aria-hidden="true" />
              </button>
            )
          })}
        </nav>
      )}
    </header>
  )
}

function NotificationButton({ alignLeft = false, variant = 'icon' }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState({})
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)
  const effectiveOpen = open && Boolean(user)

  const load = async () => {
    if (!user) return
    try {
      const [list, summary] = await Promise.all([listNotifications(), getNotificationSummary()])
      setItems(Array.isArray(list) ? list : [])
      setUnreadCount(summary?.unreadCount || 0)
    } catch {
      setItems([])
      setUnreadCount(0)
    }
  }

  useEffect(() => {
    if (!user) return
    let mounted = true
    Promise.all([listNotifications(), getNotificationSummary()])
      .then(([list, summary]) => {
        if (!mounted) return
        setItems(Array.isArray(list) ? list : [])
        setUnreadCount(summary?.unreadCount || 0)
      })
      .catch(() => {
        if (!mounted) return
        setItems([])
        setUnreadCount(0)
      })
    return () => { mounted = false }
  }, [user])

  const openNotification = async (item) => {
    try {
      await markNotificationRead(item.id)
      setUnreadCount((count) => Math.max(0, count - (item.read ? 0 : 1)))
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
    } catch {
      // Navigation should still work if the read marker fails.
    }
    setOpen(false)
    const safeAcceptUrl = typeof item.acceptUrl === 'string' && /^https?:\/\//i.test(item.acceptUrl)
    if (safeAcceptUrl) {
      window.open(item.acceptUrl, '_blank', 'noopener,noreferrer')
    } else if (item.type === 'COMMUNITY_POST_DELETED') {
      navigate('/community?view=deleted')
    } else if (item.noticeId) {
      navigate(`/notices/${item.noticeId}`)
    } else if (item.postId) {
      navigate(`/community/${item.postId}${item.commentId ? `#comment-${item.commentId}` : ''}`)
    }
  }

  const readAll = async () => {
    await markAllNotificationsRead()
    setUnreadCount(0)
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
  }

  const positionDropdown = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropdownWidth = dropdownRef.current?.offsetWidth || Math.min(352, window.innerWidth - 32)
    const dropdownHeight = dropdownRef.current?.offsetHeight || 0
    const left = alignLeft
      ? Math.min(Math.max(16, rect.left), window.innerWidth - dropdownWidth - 16)
      : Math.min(Math.max(16, rect.right - dropdownWidth), window.innerWidth - dropdownWidth - 16)
    const below = rect.bottom + 8
    const top = below + dropdownHeight <= window.innerHeight - 16
      ? below
      : Math.max(16, rect.top - dropdownHeight - 8)
    setDropdownStyle({ top, left })
  }, [alignLeft])

  useEffect(() => {
    if (!effectiveOpen) return undefined
    positionDropdown()
    window.addEventListener('scroll', positionDropdown, true)
    window.addEventListener('resize', positionDropdown)
    return () => {
      window.removeEventListener('scroll', positionDropdown, true)
      window.removeEventListener('resize', positionDropdown)
    }
  }, [effectiveOpen, positionDropdown])

  const toggle = () => {
    setOpen((v) => !v)
    load()
  }

  if (!user) return null
  const mobileMenu = variant === 'mobileMenu'

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={mobileMenu
          ? 'apple-mobile-menu-item apple-mobile-menu-notification'
          : 'relative inline-flex size-8 items-center justify-center rounded-full text-[var(--theme-body-dark)] transition hover:bg-black/5'}
        aria-label="notifications"
      >
        {mobileMenu ? (
          <>
            <Bell size={15} className="text-blue-500" />
            <span>알림</span>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : '새 알림 없음'}
            </span>
          </>
        ) : (
          <>
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </>
        )}
      </button>
      {effectiveOpen && createPortal(
        <div
          ref={dropdownRef}
          className="theme-popover fixed z-[9999] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-black/10 bg-white text-[var(--theme-body-dark)] shadow-2xl"
          style={dropdownStyle}
        >
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <span className="text-sm font-black">알림</span>
            <button type="button" onClick={readAll} className="text-xs font-bold text-[#3b4890] hover:underline">모두 읽음</button>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--theme-body-muted)]">새 알림이 없습니다.</p>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className={`notification-row block w-full border-b border-black/8 px-4 py-3 text-left text-sm last:border-b-0 ${item.read ? 'notification-row-read' : 'notification-row-unread'}`}
              >
                <span className="flex items-start gap-2">
                  <span className="notification-dot mt-1.5" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {item.actorLabel && (
                      <span className="mb-1 inline-block rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--theme-body-muted)]">{item.actorLabel}</span>
                    )}
                    <span className={`block ${item.read ? 'font-medium' : 'font-bold'}`}>{item.message}</span>
                    {item.acceptUrl && (
                      <span className="mt-1 block text-[11px] font-bold text-[#3b4890]">눌러서 수락하러 가기 →</span>
                    )}
                    <span className="mt-1 block text-[11px] text-[var(--theme-body-muted)]">{new Date(item.createdAt).toLocaleString('ko-KR')}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function AppearanceControl({
  accentColor,
  setAccentColor,
  themeMode,
  setThemeMode,
  activeFonts = [],
  selectedFontId = null,
  onFontChange,
  fontSelectionLocked = false,
  onOpenAccountSettings,
}) {
  const accent = normalizeHex(accentColor)
  const isDark = themeMode === 'dark'
  const fontSelectValue = selectedFontId ? String(selectedFontId) : ''

  return (
    <section className="appearance-control apple-footer-surface border-t border-black/10 bg-[var(--app-surface-soft)] px-5 py-8 text-[var(--app-muted)]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="apple-footer-note border-b border-black/10 pb-5 text-xs leading-5">
          <p>KW COM&apos;s는 광운대학교 학생들이 함께 공부하고 프로젝트를 만드는 중앙 컴퓨터 학술동아리입니다.</p>
          <p className="mt-2">활동 안내와 모집 일정은 공지사항을 통해 순차적으로 공개됩니다.</p>
        </div>

        <div className="appearance-panel grid gap-4 border-b border-black/10 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-subtle)]">Appearance</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--app-text)]">화면 설정</h2>
          </div>

          <div className="appearance-actions flex min-w-0 flex-col gap-3 lg:items-end">
            <button
              type="button"
              onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
              className="appearance-mode-toggle inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)] sm:w-auto"
              aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              <span className="grid size-6 place-items-center rounded-full bg-[var(--app-surface-soft)] text-[var(--app-text)]">
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </span>
              {isDark ? '라이트 모드' : '다크 모드'}
            </button>

            {activeFonts.length > 0 && (
              <div className="appearance-font-row flex flex-wrap items-center gap-2 lg:justify-end" aria-label="폰트 설정">
                <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">폰트</span>
                <span className="rounded-full border border-black/10 bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-muted)]">
                  {fontSelectionLocked ? '계정 저장 설정' : '게스트 임시 적용'}
                </span>
                {fontSelectionLocked ? (
                  <button
                    type="button"
                    onClick={onOpenAccountSettings}
                    className="rounded-full border border-black/10 bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface-elevated)] hover:text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/30"
                  >
                    계정 설정에서 변경
                  </button>
                ) : (
                  <select
                    value={fontSelectValue}
                    onChange={(event) => onFontChange?.(event.target.value)}
                    className="min-h-9 rounded-full border border-black/10 bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] outline-none transition focus:ring-2 focus:ring-[var(--app-accent)]/30"
                    aria-label="사이트 폰트 선택"
                  >
                    <option value="">기본 폰트</option>
                    {activeFonts.map((font) => (
                      <option key={font.id} value={font.id}>{font.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="appearance-color-row flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="mr-1 text-xs font-semibold text-[var(--app-muted)]">색상</span>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[var(--app-surface)] p-1.5">
                {accentSwatches.map((swatch) => {
                  const active = accent === swatch.value
                  return (
                    <button
                      key={swatch.value}
                      type="button"
                      onClick={() => setAccentColor(swatch.value)}
                      className={`relative grid size-11 min-h-11 min-w-11 place-items-center rounded-full transition hover:scale-105 sm:size-8 sm:min-h-8 sm:min-w-8 ${active ? 'ring-2 ring-[var(--app-text)] ring-offset-2 ring-offset-[var(--app-surface)]' : ''}`}
                      style={{ backgroundColor: swatch.value }}
                      aria-label={`${swatch.name} 색상 선택`}
                      title={swatch.name}
                    >
                      {active && <span className="size-2.5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.28)] sm:size-2" />}
                    </button>
                  )
                })}
              </div>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-surface-elevated)]">
                직접 선택
                <span className="relative grid size-5 overflow-hidden rounded-full border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" style={{ backgroundColor: accent }}>
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="absolute -inset-2 h-10 w-10 cursor-pointer opacity-0"
                    aria-label="커스텀 색상 선택"
                  />
                </span>
              </label>
              <button
                type="button"
                onClick={() => setAccentColor(DEFAULT_ACCENT)}
                className="min-h-9 rounded-full border border-black/10 bg-transparent px-3 text-xs font-semibold text-[var(--app-muted)] transition hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="apple-footer-directory grid gap-x-10 gap-y-6 border-b border-black/10 py-5 text-xs sm:grid-cols-3">
          {footerLinkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="font-semibold text-[var(--app-text)]">{group.title}</h3>
              <ul className="mt-2 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noreferrer' : undefined}
                      className="text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="apple-footer-bottom flex flex-col gap-3 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright © {new Date().getFullYear()} KW COM&apos;s. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="/notices" className="hover:text-[var(--app-text)]">Notices</a>
            <a href="/community" className="hover:text-[var(--app-text)]">Community</a>
            <a href="mailto:kwcoms69@gmail.com" className="hover:text-[var(--app-text)]">Contact</a>
          </div>
        </div>
      </div>
    </section>
  )
}
function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-[var(--app-accent)]" />
    </div>
  )
}

function App() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [themeMode, setThemeMode] = useState(getStoredThemeMode)
  const [accentColor, setAccentColor] = useState(getStoredAccentColor)
  const [activeFonts, setActiveFonts] = useState([])
  const [guestFontId, setGuestFontId] = useState(getStoredFontId)

  useEffect(() => {
    const root = document.documentElement
    const mode = themeMode === 'dark' ? 'dark' : 'light'
    const accent = normalizeHex(accentColor)

    root.dataset.themeMode = mode
    root.style.setProperty('--app-accent', accent)
    root.style.setProperty('--app-accent-hover', mixHex(accent, mode === 'dark' ? '#ffffff' : '#000000', mode === 'dark' ? 0.14 : 0.08))
    root.style.setProperty('--app-accent-soft', mixHex(accent, mode === 'dark' ? '#17191f' : '#ffffff', mode === 'dark' ? 0.8 : 0.88))
    root.style.setProperty('--app-accent-text', mode === 'dark' ? mixHex(accent, '#ffffff', 0.28) : mixHex(accent, '#000000', 0.08))
    root.style.setProperty('--app-accent-border', `color-mix(in srgb, ${accent} 42%, transparent)`)

    window.localStorage.setItem(THEME_MODE_KEY, mode)
    window.localStorage.setItem(ACCENT_COLOR_KEY, accent)
  }, [accentColor, themeMode])

  useEffect(() => {
    let mounted = true
    listFonts()
      .then((data) => { if (mounted) setActiveFonts(Array.isArray(data) ? data : []) })
      .catch(() => { if (mounted) setActiveFonts([]) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const styleId = 'site-font-faces'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = buildFontFaceCss(activeFonts)
    return undefined
  }, [activeFonts])

  useEffect(() => {
    injectBuiltinFontStylesheets()
  }, [])

  const combinedFonts = [...BUILT_IN_FONTS, ...activeFonts]
  const effectiveFontId = user ? (user.selectedBuiltinFontKey ?? user.selectedFontId) : guestFontId
  const selectedFont = combinedFonts.find((font) => String(font.id) === String(effectiveFontId))

  useEffect(() => {
    const root = document.documentElement
    if (selectedFont) {
      root.style.setProperty('--apple-font-family', fontFamilyValue(selectedFont))
    } else {
      root.style.removeProperty('--apple-font-family')
    }
  }, [selectedFont])

  const handleGuestFontChange = (value) => {
    if (!value) {
      setGuestFontId(null)
      window.localStorage.removeItem(FONT_SELECTION_KEY)
      return
    }
    if (String(value).startsWith('b:')) {
      setGuestFontId(value)
      window.localStorage.setItem(FONT_SELECTION_KEY, value)
      return
    }
    const id = Number(value)
    if (Number.isFinite(id) && id > 0) {
      setGuestFontId(id)
      window.localStorage.setItem(FONT_SELECTION_KEY, String(id))
    } else {
      setGuestFontId(null)
      window.localStorage.removeItem(FONT_SELECTION_KEY)
    }
  }

  const openAccountSettings = () => {
    navigate('/settings')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <ScrollToTop />
      <GlobalNavigation />
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/activities" element={<ActivitiesDetailPage />} />
        <Route path="/activity-log" element={<ActivityLogPage />} />
        <Route path="/monthly-calendar" element={<MonthlyCalendarPage />} />
        <Route path="/projects" element={<ProjectsDetailPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/notices" element={<NoticesPage />} />
        <Route path="/notices/:id" element={<NoticesPage />} />
        <Route path="/resources" element={<RequireAuth><ArchivePage /></RequireAuth>} />
        <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
        <Route path="/community/:id" element={<RequireAuth><CommunityPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/recruit" element={<RecruitPage />} />
        <Route path="/recruit-notice" element={<RecruitNoticePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppearanceControl
        accentColor={accentColor}
        setAccentColor={setAccentColor}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        activeFonts={combinedFonts}
        selectedFontId={effectiveFontId}
        onFontChange={handleGuestFontChange}
        fontSelectionLocked={Boolean(user)}
        onOpenAccountSettings={openAccountSettings}
      />
    </Suspense>
  )
}

// ─── Home page ──────────────────────────────────────────────────────────────

function AboutPage() {
  return (
    <DetailStoryPage
      eyebrow="About COM's"
      title="함께 배우고, 바로 만듭니다."
      body="COM's는 광운대학교 학생들이 컴퓨터와 소프트웨어를 함께 공부하고, 실제 프로젝트로 연결하는 중앙 컴퓨터 학술동아리입니다."
      visualTitle="Club OS"
      visualSubtitle="Study · Build · Share"
      visualRows={['학습 로드맵', '프로젝트 트랙', '커뮤니티 로그']}
      cards={aboutDetailCards}
      flow={aboutDetailFlow}
      outputsEyebrow="Culture"
      outputsTitle="COM's가 오래 가져가는 태도."
      outputsBody="잘하는 사람만 모이는 곳보다, 함께 성장하는 방식을 계속 만드는 곳을 지향합니다."
      outputs={aboutDetailPrinciples}
    />
  )
}

function ActivityLogSection({ compact = false }) {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState(null)
  const [error, setError] = useState('')
  const [activityForm, setActivityForm] = useState({
    title: '',
    eventDate: '',
    category: 'SEMINAR',
    description: '',
  })
  const [activityImage, setActivityImage] = useState(null)
  const [savingActivity, setSavingActivity] = useState(false)
  const [activityNotice, setActivityNotice] = useState('')

  useEffect(() => {
    if (authLoading || !user) {
      return undefined
    }
    let mounted = true
    listClubActivities()
      .then((data) => {
        if (!mounted) return
        setError('')
        setRecords(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.message || '활동 기록을 불러오지 못했습니다.')
        setRecords([])
      })
    return () => { mounted = false }
  }, [authLoading, user])

  const loading = Boolean(user && records === null && !error)
  const activityItems = (user ? records || [] : []).filter((item) => item.kind === 'ACTIVITY')
  const visibleItems = compact ? activityItems.slice(0, 3) : activityItems
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'

  const submitActivity = async (event) => {
    event.preventDefault()
    if (!activityForm.title.trim() || !activityForm.eventDate) return
    const form = event.currentTarget
    setSavingActivity(true)
    setActivityNotice('')
    setError('')
    try {
      const created = await createClubActivity({
        kind: 'ACTIVITY',
        category: activityForm.category,
        title: activityForm.title.trim(),
        description: activityForm.description.trim(),
        eventDate: activityForm.eventDate,
        image: activityImage,
      })
      setRecords((prev) => [created, ...(Array.isArray(prev) ? prev : [])])
      setActivityNotice('활동 기록을 추가했습니다.')
      setActivityForm((prev) => ({ ...prev, title: '', eventDate: '', description: '' }))
      setActivityImage(null)
      form.reset()
    } catch (err) {
      setError(err.message || '활동 기록을 추가하지 못했습니다.')
    } finally {
      setSavingActivity(false)
    }
  }

  return (
    <section id="activity-log" className={`activity-proof-section ${compact ? 'activity-proof-section-compact' : ''} scroll-mt-24 bg-white px-5 py-12 sm:py-16`}>
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.62fr_1fr] lg:items-end">
          <div>
            <p className="apple-eyebrow">Activity log</p>
            <h2 className="apple-display mt-3 text-4xl sm:text-5xl">실제로 이어지는 활동 기록</h2>
            <p className="apple-copy mt-4 max-w-2xl text-lg">
              신입생이 가장 먼저 궁금해하는 것은 지금도 활동이 이어지는지입니다. 검증된 활동 사진과 기록이 등록되면 날짜, 활동명, 후기 흐름으로 보여줍니다.
            </p>
          </div>
          <div className="activity-proof-note apple-soft-panel px-5 py-5">
            <p className="text-sm font-semibold text-[#1d1d1f]">기록 방식</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6e6e73]">
              세미나, 스터디, 프로젝트 발표, MT/행사, 수상/성과처럼 실제 확인된 항목만 활동 로그에 노출합니다.
            </p>
          </div>
        </div>

        {isAdmin && !isLocked && (
          <form onSubmit={submitActivity} className="activity-admin-composer mt-8" aria-label="활동 기록 추가">
            <div>
              <p className="activity-admin-composer-title">관리자 활동 기록 작성</p>
              <p className="activity-admin-composer-copy">세미나, 스터디, 프로젝트 발표, MT/행사, 성과 기록을 활동 로그에 바로 추가합니다.</p>
            </div>
            <label>
              <span>활동 제목</span>
              <input
                value={activityForm.title}
                onChange={(event) => setActivityForm((prev) => ({ ...prev, title: event.target.value }))}
                maxLength={120}
              />
            </label>
            <label>
              <span>활동 날짜</span>
              <input
                type="date"
                value={activityForm.eventDate}
                onChange={(event) => setActivityForm((prev) => ({ ...prev, eventDate: event.target.value }))}
              />
            </label>
            <label>
              <span>활동 분류</span>
              <select
                value={activityForm.category}
                onChange={(event) => setActivityForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                {clubActivityCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>활동 사진</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setActivityImage(event.target.files?.[0] || null)}
              />
            </label>
            <label className="activity-admin-composer-wide">
              <span>활동 내용</span>
              <textarea
                value={activityForm.description}
                onChange={(event) => setActivityForm((prev) => ({ ...prev, description: event.target.value }))}
                maxLength={500}
                rows={3}
              />
            </label>
            <button
              type="submit"
              disabled={savingActivity || !activityForm.title.trim() || !activityForm.eventDate}
            >
              {savingActivity ? '추가 중...' : '활동 기록 추가'}
            </button>
            {activityNotice && <p className="activity-admin-composer-notice">{activityNotice}</p>}
          </form>
        )}

        {authLoading || loading ? (
          <div className="activity-empty-state mt-8">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <h3>활동 기록을 불러오는 중...</h3>
              <p>회원 상태와 등록된 활동 기록을 확인하고 있습니다.</p>
            </div>
          </div>
        ) : isLocked ? (
          <div className="activity-empty-state activity-locked-state mt-8">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <h3>로그인 하세요</h3>
              <p>회원 로그인 후 활동 기록과 일정을 확인할 수 있습니다.</p>
              <button type="button" onClick={() => navigate('/login')} className="apple-action-primary mt-3 inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">
                로그인
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="activity-empty-state mt-8">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <h3>활동 기록을 불러오지 못했습니다.</h3>
              <p>{error}</p>
            </div>
          </div>
        ) : visibleItems.length > 0 ? (
          <div className="activity-log-grid mt-8">
            {visibleItems.map((item) => (
              <article key={item.id} className="activity-log-card activity-log-card-blue">
                <div className={`activity-log-photo ${item.imageUrl ? 'activity-log-photo-has-image' : ''}`}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="activity-log-image" loading="lazy" />
                  ) : (
                    <>
                      <div className="activity-log-photo-bar" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="activity-log-photo-mark" aria-hidden="true">
                        <Sparkles size={24} />
                      </div>
                    </>
                  )}
                  <div className="activity-log-photo-caption">
                    <span>{categoryLabel(item.category)}</span>
                    <strong>{formatActivityDate(item.eventDate)}</strong>
                  </div>
                </div>
                <div className="activity-log-body">
                  <p className="activity-log-term">{item.createdByName || 'COM\'s'}</p>
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                  <div className="activity-log-tags" aria-label={`${item.title} 태그`}>
                    <span>{categoryLabel(item.category)}</span>
                    {item.imageOriginalName && <span>사진 기록</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="activity-empty-state mt-8">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <h3>등록된 활동 기록이 없습니다.</h3>
              <p>확인된 활동 사진, 후기, 성과 기록이 추가되면 이 영역에 바로 표시됩니다.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function ClubCalendarSection({ compact = false }) {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState(null)
  const [error, setError] = useState('')
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    eventDate: '',
    category: 'MEETING',
    description: '',
  })
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleNotice, setScheduleNotice] = useState('')

  useEffect(() => {
    if (authLoading || !user) {
      return undefined
    }
    let mounted = true
    listClubActivities()
      .then((data) => {
        if (!mounted) return
        setError('')
        setRecords(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.message || '일정을 불러오지 못했습니다.')
        setRecords([])
      })
    return () => { mounted = false }
  }, [authLoading, user])

  const loading = Boolean(user && records === null && !error)
  const scheduleItems = (user ? records || [] : []).filter((item) => item.kind === 'SCHEDULE')
  const calendarMonth = buildCalendarMonth(parseLocalDate(scheduleItems[0]?.eventDate) || new Date())
  const eventsByDay = scheduleItems.reduce((acc, event) => {
    const eventDate = parseLocalDate(event.eventDate)
    if (!eventDate) return acc
    if (eventDate.getFullYear() !== calendarMonth.year || eventDate.getMonth() !== calendarMonth.month) return acc
    const day = eventDate.getDate()
    acc[day] = [...(acc[day] || []), event]
    return acc
  }, {})
  const isLocked = !authLoading && !user
  const isAdmin = user?.role === 'ADMIN'

  const submitSchedule = async (event) => {
    event.preventDefault()
    if (!scheduleForm.title.trim() || !scheduleForm.eventDate) return
    setSavingSchedule(true)
    setScheduleNotice('')
    setError('')
    try {
      const created = await createClubActivity({
        kind: 'SCHEDULE',
        category: scheduleForm.category,
        title: scheduleForm.title.trim(),
        description: scheduleForm.description.trim(),
        eventDate: scheduleForm.eventDate,
      })
      setRecords((prev) => [created, ...(Array.isArray(prev) ? prev : [])])
      setScheduleNotice('일정을 추가했습니다.')
      setScheduleForm((prev) => ({ ...prev, title: '', description: '', eventDate: '' }))
    } catch (err) {
      setError(err.message || '일정을 추가하지 못했습니다.')
    } finally {
      setSavingSchedule(false)
    }
  }

  return (
    <section id="monthly-calendar" className={`club-calendar-section ${compact ? 'club-calendar-section-compact' : ''} scroll-mt-24 bg-[#f5f5f7] px-5 py-12 sm:py-16`}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="apple-eyebrow">Monthly calendar</p>
            <h2 className="apple-display mt-3 text-4xl sm:text-5xl">동아리 일정 캘린더</h2>
            <p className="apple-copy mt-4 max-w-2xl text-lg">
              공지사항 목록만으로 놓치기 쉬운 정기 회의, 세미나, 스터디, 발표, 모집 마감, MT/행사를 월별 흐름으로 확인합니다.
            </p>
          </div>
          <div className="club-calendar-title">
            <CalendarDays size={18} aria-hidden="true" />
            <span>{calendarMonth.title}</span>
          </div>
        </div>

        {isAdmin && !isLocked && (
          <form onSubmit={submitSchedule} className="calendar-admin-composer mt-8" aria-label="캘린더 일정 추가">
            <div>
              <p className="calendar-admin-composer-title">관리자 일정 추가</p>
              <p className="calendar-admin-composer-copy">캘린더에 바로 표시할 정기 회의, 세미나, 발표, 모집 마감 일정을 등록합니다.</p>
            </div>
            <label>
              <span>일정 제목</span>
              <input
                value={scheduleForm.title}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, title: event.target.value }))}
                maxLength={120}
              />
            </label>
            <label>
              <span>일정 날짜</span>
              <input
                type="date"
                value={scheduleForm.eventDate}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, eventDate: event.target.value }))}
              />
            </label>
            <label>
              <span>일정 분류</span>
              <select
                value={scheduleForm.category}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                {clubActivityCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="calendar-admin-composer-wide">
              <span>일정 설명</span>
              <input
                value={scheduleForm.description}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, description: event.target.value }))}
                maxLength={500}
              />
            </label>
            <button
              type="submit"
              disabled={savingSchedule || !scheduleForm.title.trim() || !scheduleForm.eventDate}
            >
              {savingSchedule ? '추가 중...' : '일정 추가'}
            </button>
            {scheduleNotice && <p className="calendar-admin-composer-notice">{scheduleNotice}</p>}
          </form>
        )}

        <div className="club-calendar-shell mt-8">
          <div className="club-calendar-weekdays" aria-hidden="true">
            {calendarWeekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="club-calendar-grid">
            {Array.from({ length: calendarMonth.leadingBlanks }, (_, index) => (
              <div key={`leading-${index}`} className="club-calendar-day club-calendar-day-empty" aria-hidden="true" />
            ))}
            {calendarMonth.days.map((day) => {
              const dayEvents = eventsByDay[day] || []
              return (
                <div key={day} className={`club-calendar-day ${dayEvents.length ? 'club-calendar-day-active' : ''}`}>
                  <span className="club-calendar-day-number">{day}</span>
                  <div className="club-calendar-events">
                    {dayEvents.map((event) => (
                      <span key={`${day}-${event.title}`} className={`club-calendar-event club-calendar-event-${(event.category || 'event').toLowerCase()}`}>
                        {event.title}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            {Array.from({ length: calendarMonth.trailingBlanks }, (_, index) => (
              <div key={`trailing-${index}`} className="club-calendar-day club-calendar-day-empty" aria-hidden="true" />
            ))}
          </div>
          {(authLoading || loading) && (
            <div className="calendar-empty-state">
              동아리 일정을 불러오는 중입니다.
            </div>
          )}
          {isLocked && (
            <div className="calendar-empty-state">
              <strong>회원 전용 일정</strong>
              <span>회원 로그인 후 월별 동아리 일정을 확인할 수 있습니다.</span>
              <button type="button" onClick={() => navigate('/login')} className="apple-action-primary ml-2 inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs">
                로그인
              </button>
            </div>
          )}
          {!isLocked && !loading && error && (
            <div className="calendar-empty-state">
              {error}
            </div>
          )}
          {!isLocked && !loading && !error && scheduleItems.length === 0 && (
            <div className="calendar-empty-state">
              등록된 일정이 없습니다. 실제 정기 회의, 세미나, 스터디, 프로젝트 발표, 모집 마감, MT/행사 일정이 추가되면 캘린더에 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function DetailStoryPage({
  eyebrow,
  title,
  body,
  visualTitle,
  visualSubtitle,
  visualRows,
  cards,
  flow,
  outputsEyebrow = 'Archive',
  outputsTitle,
  outputsBody = '학기마다 쌓인 활동은 다음 부원이 참고할 수 있는 자료와 경험으로 남습니다.',
  outputs,
}) {
  const navigate = useNavigate()
  const titleRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const titleEl = titleRef.current
    if (!titleEl) return undefined

    let active = true
    let frameId = 0

    const fitTitle = () => {
      if (!active) return
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        if (!active) return

        const phrases = Array.from(titleEl.querySelectorAll('.apple-detail-title-phrase'))
        if (phrases.length === 0) return

        const availableWidth = titleEl.clientWidth
        const currentFit = Number.parseFloat(getComputedStyle(titleEl).getPropertyValue('--apple-title-fit')) || 1
        const widestPhrase = phrases.reduce((max, phrase) => Math.max(max, phrase.scrollWidth / currentFit), 0)
        if (!availableWidth || !widestPhrase) return

        const nextFit = Math.min(1, Math.max(DETAIL_TITLE_MIN_FIT, (availableWidth - 2) / widestPhrase))
        if (Math.abs(nextFit - currentFit) > 0.004) {
          titleEl.style.setProperty('--apple-title-fit', nextFit.toFixed(3))
        }
      })
    }

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitTitle)
    resizeObserver?.observe(titleEl)

    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(fitTitle)
    mutationObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

    const fontSet = document.fonts
    fontSet?.addEventListener?.('loadingdone', fitTitle)
    fontSet?.ready?.then(fitTitle).catch(() => {})
    window.addEventListener('resize', fitTitle)

    fitTitle()

    return () => {
      active = false
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      fontSet?.removeEventListener?.('loadingdone', fitTitle)
      window.removeEventListener('resize', fitTitle)
    }
  }, [title])

  return (
    <div className="apple-detail-page theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <main className="apple-detail-main relative overflow-hidden">
        <section className="apple-detail-hero relative grid min-h-[calc(88svh-44px)] items-center gap-12 overflow-hidden bg-[#f5f5f7] px-5 py-16 lg:grid-cols-[1fr_0.88fr] lg:px-12">
          <div className="home-hero-surface absolute inset-0" />
          <div className="relative z-10 mx-auto max-w-3xl text-center lg:text-left">
            <button type="button" onClick={() => navigate('/')} className="apple-detail-home-button mx-auto mb-8 lg:mx-0">
              <ArrowLeft size={15} />
              메인으로 돌아가기
            </button>
            <p className="apple-eyebrow">{eyebrow}</p>
            <h1 ref={titleRef} className="apple-display apple-detail-title mt-4">{title}</h1>
            <p className="apple-copy mt-6 text-xl sm:text-2xl">{body}</p>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-xl">
            <div className="apple-detail-visual rounded-lg bg-white/82 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-2xl">
              <div className="mb-7 flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#ffbd2e]" />
                <span className="size-3 rounded-full bg-[#0071e3]" />
              </div>
              <div className="rounded-lg bg-[#f5f5f7] px-6 py-7">
                <p className="text-3xl font-semibold text-[#1d1d1f]">{visualTitle}</p>
                <p className="mt-2 text-base font-semibold text-[#6e6e73]">{visualSubtitle}</p>
              </div>
              <div className="mt-4 grid gap-3">
                {visualRows.map((row, index) => (
                  <div key={row} className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.05)]">
                    <span className="size-2.5 rounded-full bg-[var(--app-accent)]" />
                    <span>{row}</span>
                    <span className="ml-auto text-xs text-[#86868b]">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="apple-eyebrow">Inside</p>
              <h2 className="apple-display mt-4 text-5xl sm:text-6xl">무엇을 하고, 어떻게 이어가는지.</h2>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {cards.map(({ title: cardTitle, eyebrow: cardEyebrow, body: cardBody, icon: Icon }) => (
                <article key={cardTitle} className="apple-product-panel apple-detail-card min-h-[19rem] px-7 py-7">
                  <div className="mb-8 inline-flex size-11 items-center justify-center rounded-full bg-[#f5f5f7] text-[#0066cc]">
                    <Icon size={20} />
                  </div>
                  <p className="apple-eyebrow">{cardEyebrow}</p>
                  <h3 className="mt-3 text-3xl font-semibold text-[#1d1d1f]">{cardTitle}</h3>
                  <p className="mt-4 text-[15px] font-medium leading-7 text-[#6e6e73]">{cardBody}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f5f5f7] px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="apple-eyebrow text-center">Flow</p>
            <h2 className="apple-display mx-auto mt-4 max-w-4xl text-center text-5xl sm:text-6xl">작게 시작해서 오래 남기는 방식.</h2>
            <div className="mt-12 grid gap-3">
              {flow.map(([number, flowTitle, flowBody]) => (
                <article key={number} className="apple-flow-row grid gap-4 rounded-lg bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:grid-cols-[5rem_1fr] sm:items-center">
                  <span className="text-3xl font-semibold text-[#0066cc]">{number}</span>
                  <div>
                    <h3 className="text-2xl font-semibold text-[#1d1d1f]">{flowTitle}</h3>
                    <p className="mt-2 text-[15px] font-medium leading-7 text-[#6e6e73]">{flowBody}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1fr] lg:items-center">
            <div>
              <p className="apple-eyebrow">{outputsEyebrow}</p>
              <h2 className="apple-display mt-4 text-5xl sm:text-6xl">{outputsTitle}</h2>
              <p className="apple-copy mt-5 text-xl">{outputsBody}</p>
            </div>
            <div className="grid gap-3">
              {outputs.map((item, index) => (
                <div key={item} className="apple-output-row flex items-center gap-4 rounded-lg bg-[#f5f5f7] px-5 py-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#0066cc]">{index + 1}</span>
                  <p className="text-lg font-semibold leading-7 text-[#1d1d1f]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function ActivitiesDetailPage() {
  return (
    <DetailStoryPage
      eyebrow="Activities"
      title={(
        <>
          <span className="apple-detail-title-phrase">배움이 매주 쌓이고,</span>{' '}
          <span className="apple-detail-title-phrase">서로에게 남습니다.</span>
        </>
      )}
      body="COM's의 활동은 정기 세미나, 분야별 스터디, 코드 리뷰, 작은 제작 과제가 이어지는 흐름입니다. 처음 시작하는 사람도 따라올 수 있고, 이미 경험이 있는 사람도 더 깊게 확장할 수 있습니다."
      visualTitle="Learning Stack"
      visualSubtitle="Seminar · Study · Review"
      visualRows={['정기 세미나', '분야별 스터디', '코드 리뷰']}
      cards={activitiesDetailCards}
      flow={activitiesDetailFlow}
      outputsTitle="활동이 남기는 기록."
      outputs={activitiesDetailTopics}
    />
  )
}

function ActivityLogPage() {
  return <ActivityLogSection />
}

function MonthlyCalendarPage() {
  return <ClubCalendarSection />
}

function AppsPage() {
  return (
    <div className="apple-detail-page theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <main className="relative overflow-hidden pt-12">
        <CompanionServicesSection />
      </main>
    </div>
  )
}

function CompanionServicesSection() {
  return (
    <section className="bg-white px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-end">
          <div>
            <p className="apple-eyebrow">Service launcher</p>
            <h2 className="apple-display mt-3 text-4xl sm:text-5xl">COM&apos;s Apps</h2>
            <p className="apple-copy mt-4 max-w-xl text-lg">
              공식 웹사이트에서 동아리 주변 서비스로 바로 이동할 수 있게 묶었습니다. 활동, 팀 편성, 게임, 캠퍼스 유틸, 코딩 루틴을 한 흐름으로 이어갑니다.
            </p>
          </div>
          <div className="apple-soft-panel bg-[#f5f5f7] px-5 py-5">
            <p className="text-sm font-semibold text-[#1d1d1f]">개선 방향</p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#6e6e73]">
              다음 단계로는 통합 로그인 상태 표시, 서비스별 운영 상태, 최근 활동 요약을 붙이면 COM&apos;s 전체 생태계가 더 선명해집니다.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {companionServices.map((service) => (
            <a
              key={service.title}
              href={service.href}
              target="_blank"
              rel="noreferrer"
              className="apple-product-panel group flex min-h-64 flex-col px-6 py-6 text-left no-underline transition hover:-translate-y-0.5"
            >
              <p className="text-sm font-semibold text-[#0066cc]">{service.eyebrow}</p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#1d1d1f]">{service.title}</h3>
              <p className="mt-3 flex-1 text-sm font-medium leading-6 text-[#6e6e73]">{service.body}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#0066cc]">
                열기
                <ArrowUpRight size={15} aria-hidden="true" />
              </span>
              <span className="mt-3 truncate rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#86868b]">
                {service.domain}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProjectsDetailPage() {
  return (
    <DetailStoryPage
      eyebrow="Projects"
      title="아이디어를 실제 서비스와 제작물로."
      body="COM's의 프로젝트는 동아리 안에서 쓰이는 서비스, 교육용 실습, 웹 개발 결과물처럼 실제로 동작하는 결과물을 만드는 데 집중합니다. 기획부터 구현, 배포와 개선까지 팀으로 경험합니다."
      visualTitle="Project Lab"
      visualSubtitle="Prototype · Launch · Iterate"
      visualRows={['서비스 기획', '팀 구현', '배포와 개선']}
      cards={projectsDetailCards}
      flow={projectsDetailFlow}
      outputsTitle="프로젝트가 남기는 결과물."
      outputs={projectsDetailOutputs}
    />
  )
}

function HomeView() {
  const navigate = useNavigate()
  const location = useLocation()
  const aboutRef = useRef(null)
  const activitiesRef = useRef(null)
  const projectsRef = useRef(null)
  const recruitRef = useRef(null)
  const [latestNotice, setLatestNotice] = useState(null)

  useEffect(() => {
    let mounted = true
    listNotices()
      .then((data) => {
        if (!mounted) return
        const notices = Array.isArray(data) ? data : []
        const general = notices.find((n) => (n.category || 'GENERAL') === 'GENERAL')
        if (general) setLatestNotice(general)
      })
      .catch((err) => console.warn('Failed to load latest notice', err))
    return () => { mounted = false }
  }, [])

  const openPanel = (id) => {
    const map = { about: aboutRef, activities: activitiesRef, projects: projectsRef, recruit: recruitRef }
    const ref = map[id]
    if (ref && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const navHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--apple-nav-height')) || 44
      const targetY = Math.max(0, window.scrollY + rect.top - navHeight - 10)
      window.scrollTo({ top: targetY, behavior: 'smooth' })
    }
  }

  const goNotices = () => navigate('/notices')
  const goPageTop = (to, options) => {
    scrollToTopInstant()
    navigate(to, options)
  }
  const goRecruitPage = () => goPageTop('/recruit')
  const locationPath = () => `${location.pathname}${location.search}${location.hash}`

  const renderSectionContent = (id) => {
    const story = sectionStories[id]
    if (story) {
      const metrics = sectionMetrics[id]
      const detailItems = id === 'activities'
        ? activityDetails.slice(0, 2)
        : id === 'projects'
          ? projectDetails.slice(0, 3)
          : []

      const primaryAction = () => {
        if (id === 'about') goPageTop('/about')
        if (id === 'activities') goPageTop('/activities')
        if (id === 'projects') goPageTop('/projects')
        if (id === 'recruit') goRecruitPage()
      }

      const secondaryAction = () => {
        if (id === 'about') openPanel('activities')
        if (id === 'activities') goPageTop('/projects')
        if (id === 'recruit') goPageTop('/recruit-notice', { state: { from: `${locationPath()}#recruit` } })
      }

      return (
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-4xl text-center">
            <p className="apple-eyebrow">{sectionMeta[id].eyebrow}</p>
            <h2 className="apple-display mt-4 text-5xl sm:text-6xl lg:text-7xl">{story.title}</h2>
            <p className="apple-copy mx-auto mt-6 max-w-3xl text-xl sm:text-2xl">{story.body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={primaryAction} className={solidActionBtnClass}>
                {story.primary}
              </button>
              {id === 'projects' ? (
                <a href="https://github.com/kw-coms" target="_blank" rel="noreferrer" className={ghostActionBtnClass}>{story.secondary}</a>
              ) : (
                <button type="button" onClick={secondaryAction} className={ghostActionBtnClass}>{story.secondary}</button>
              )}
            </div>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            {metrics.map((item) => (
              <div key={item.value} className="apple-soft-panel px-4 py-5 text-center">
                <p className="text-lg font-semibold text-[#1d1d1f]">{item.value}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#6e6e73]">{item.label}</p>
              </div>
            ))}
          </div>

          {id === 'about' && (
            <div className="mt-10 grid gap-3 lg:grid-cols-3">
              {showcaseItems.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => openPanel(item.target)}
                  className="apple-product-panel group min-h-48 px-6 py-6 text-left transition hover:-translate-y-0.5"
                >
                  <p className="apple-eyebrow">{item.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#1d1d1f]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#6e6e73]">{item.body}</p>
                </button>
              ))}
            </div>
          )}

          {detailItems.length > 0 && (
            <div className={`mt-10 grid gap-3 ${id === 'projects' ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {detailItems.map((item, index) => (
                <article key={item.title} className="apple-product-panel px-6 py-6 text-left transition hover:-translate-y-0.5">
                  <div className="mb-5 inline-flex size-9 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#0066cc]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h3 className="text-xl font-semibold text-[#1d1d1f]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-[#6e6e73]">{item.description}</p>
                </article>
              ))}
            </div>
          )}

        </div>
      )
    }
    return null
  }

  const renderSectionPanel = (id) => {
    const meta = sectionMeta[id]
    const visual = visualDetails[id]
    return (
      <div data-panel="true" className={`w-full overflow-hidden ${id === 'about' || id === 'projects' ? 'apple-section-band' : 'apple-section-band-muted'}`} style={{ background: meta.background }}>
        <div className="apple-section-grid mx-auto grid min-h-[calc(100svh-44px)] max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.75fr)] lg:px-10">
          <div className="flex items-center">
            {renderSectionContent(id)}
          </div>
          <div className="flex items-center justify-center">
            <div className="home-device apple-device-card relative aspect-square w-full max-w-md overflow-hidden rounded-lg ring-1 ring-black/5" style={{ background: meta.visual }}>
              <div className="absolute inset-0 bg-linear-to-b from-white/30 via-transparent to-black/5" />
              <div className="absolute inset-x-6 top-6 rounded-lg bg-white/78 px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="size-2.5 rounded-full bg-[#0071e3]" />
                </div>
                <p className="text-2xl font-semibold text-[#1d1d1f]">{visual.title}</p>
                <p className="mt-1 text-sm font-semibold text-[#6e6e73]">{visual.subtitle}</p>
              </div>
              <div className="absolute left-1/2 top-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2rem] bg-white/72 shadow-[0_24px_70px_rgba(0,0,0,0.12)] backdrop-blur-md sm:size-40">
                <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's" className="home-logo-float w-[68%] object-contain" />
              </div>
              <div className="absolute bottom-6 left-6 right-6 space-y-2">
                {visual.rows.map((row, index) => (
                  <div key={row} className="flex items-center gap-3 rounded-lg bg-white/76 px-4 py-3 text-sm font-semibold text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: visual.accent }} />
                    <span>{row}</span>
                    <span className="ml-auto text-xs text-[#86868b]">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="theme-home relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">

      <main className="apple-home-main relative overflow-hidden">
        <section className="apple-home-hero relative flex min-h-[calc(78svh-44px)] items-center justify-center overflow-hidden bg-[#f5f5f7] px-5 py-10 text-center sm:min-h-[calc(84svh-44px)] sm:py-12">
          <div className="home-hero-surface absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-b from-transparent to-white/82" />
          <div className="relative z-10 mx-auto w-full max-w-5xl">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/64 px-3 py-1.5 text-xs font-semibold text-[#6e6e73] shadow-[0_4px_16px_rgba(0,0,0,0.05)] backdrop-blur-xl">
              <span className="size-2 rounded-full bg-[var(--app-accent)]" />
              2026 Semester Ready
            </div>
            <div className="relative mx-auto mt-6 flex h-28 w-28 items-center justify-center sm:mt-7 sm:h-36 sm:w-36">
              <div className="absolute inset-0 rounded-[1.75rem] bg-white/82 shadow-[0_18px_54px_rgba(0,0,0,0.09)] ring-1 ring-black/5" />
              <img src={getLogoAsset('COMs_logo_vec')} alt="KW COM's Logo" className="home-logo-float relative z-10 h-20 w-20 object-contain sm:h-24 sm:w-24" />
            </div>
            <p className="mt-6 text-sm font-semibold text-[#6e6e73]">Kwangwoon University Computer Club</p>
            <h2 className="apple-display mt-2 whitespace-nowrap text-[3.2rem] sm:text-8xl lg:text-[8.5rem]">
              KW COM&apos;s
            </h2>
            <p className="apple-copy mx-auto mt-5 max-w-[20rem] text-lg sm:max-w-3xl sm:text-2xl">
              배우고, 만들고, 성장하는 광운대학교 컴퓨터 학술동아리.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => openPanel('about')} className={solidActionBtnClass}>더 알아보기</button>
              <button type="button" onClick={goRecruitPage} className={ghostActionBtnClass}>지원하기</button>
            </div>
            {latestNotice && (
              <button type="button" onClick={goNotices} className="mx-auto mt-7 flex max-w-md items-center gap-2 rounded-full bg-white px-4 py-2 text-left shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition hover:shadow-[0_5px_18px_rgba(0,0,0,0.12)]">
                <Megaphone size={14} className="shrink-0 text-[var(--app-accent-text)]" />
                <span className="truncate text-xs font-semibold text-[#1d1d1f]">{latestNotice.title}</span>
                <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-[#0066cc]">공지</span>
              </button>
            )}
            <div className="mx-auto mt-6 flex max-w-[21rem] flex-wrap justify-center gap-2 sm:max-w-3xl">
              {experiencePills.map((pill) => (
                <span key={pill} className="rounded-full bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[#6e6e73] shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-3 sm:text-xs">
                  {pill}
                </span>
              ))}
            </div>
            <div className="apple-hero-metrics mx-auto mt-8 hidden max-w-3xl grid-cols-3 sm:grid">
              {heroHighlights.map((item) => (
                <div key={item.value} className="px-5 text-center">
                  <p className="text-[11px] font-semibold text-[#86868b]">{item.label}</p>
                  <p className="mt-1 text-base font-semibold text-[#1d1d1f]">{item.value}</p>
                  <p className="mt-1 text-xs leading-5 text-[#6e6e73]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="apple-showcase-strip bg-white px-5 py-4 sm:py-6">
          <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-3">
            {showcaseItems.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => openPanel(item.target)}
                className={`apple-product-panel apple-showcase-card group min-h-[12rem] px-6 py-6 text-left transition hover:-translate-y-0.5 ${index === 0 ? 'apple-showcase-card-dark text-white' : index === 1 ? 'apple-showcase-card-plain text-[#1d1d1f]' : 'apple-showcase-card-soft text-[#1d1d1f]'}`}
              >
                <p className={`text-sm font-semibold ${index === 0 ? 'text-white/58' : 'text-[#0066cc]'}`}>{item.eyebrow}</p>
                <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-normal">{item.title}</h3>
                <p className={`mt-4 max-w-sm leading-7 ${index === 0 ? 'text-white/70' : 'text-[#6e6e73]'}`}>{item.body}</p>
                <span className={`mt-8 inline-flex rounded-full px-4 py-2 text-sm font-semibold ${index === 0 ? 'bg-white text-[#1d1d1f]' : 'bg-[#0071e3] text-white'}`}>더 보기</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-[#f5f5f7] px-5 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="apple-eyebrow">Member loop</p>
                <h2 className="apple-display mt-3 text-4xl sm:text-5xl">활동 허브</h2>
                <p className="apple-copy mt-3 max-w-2xl text-lg">
                  공지, 커뮤니티, 자료실을 한 번에 이어서 부원이 다시 들어올 이유를 분명하게 만듭니다.
                </p>
              </div>
              <button type="button" onClick={() => goPageTop('/notices')} className={ghostActionBtnClass}>최근 공지 보기</button>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {activityHubItems.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => goPageTop(item.route)}
                  className="apple-product-panel min-h-44 px-6 py-6 text-left transition hover:-translate-y-0.5"
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e8f3ff] text-sm font-bold text-[#0066cc]">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold text-[#1d1d1f]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#6e6e73]">{item.body}</p>
                  <span className="mt-5 inline-flex text-sm font-bold text-[#0066cc]">{item.cta}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <ClubCalendarSection compact />

        <section ref={aboutRef} id="about" className="relative">
          {renderSectionPanel('about')}
        </section>
        <section ref={activitiesRef} id="activities" className="relative">
          {renderSectionPanel('activities')}
        </section>
        <section ref={projectsRef} id="projects" className="relative">
          {renderSectionPanel('projects')}
        </section>
        <section ref={recruitRef} id="recruit" className="relative">
          {renderSectionPanel('recruit')}
        </section>
      </main>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function PageShell({ children, wide = false, full = false, transition = true }) {
  return (
    <div className="apple-route relative min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] selection:bg-[var(--app-accent-soft)] selection:text-[var(--app-text)]">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white via-[#f5f5f7] to-white" />
      <main className={`apple-page-shell-main ${full ? 'apple-page-shell-main-full' : ''} relative mx-auto flex min-h-screen min-w-0 px-4 sm:px-6 ${full ? 'items-start pt-20 pb-16' : 'items-center justify-center py-24'} ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
        <div className={`${transition ? 'page-transition' : ''} w-full min-w-0 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</div>
      </main>
    </div>
  )
}

export default App
