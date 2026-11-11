import { RECRUIT_FACTS, recruitFactRows } from './recruitFacts'

const beginnerFact = recruitFactRows.find((fact) => fact.label === '경험')!.value

export const ASK_FAQS = [
  {
    id: 'join',
    question: '어떻게 가입하나요?',
    answer: '지원서는 로그인 없이 제출할 수 있습니다. 운영진이 확인한 뒤 개별 안내를 드려요. 지금의 모집 안내와 접수 방법은 지원하기 페이지에서 확인해 주세요.',
    href: '/recruit',
    linkLabel: '현재 모집 안내 보기',
  },
  {
    id: 'beginner',
    question: '코딩을 처음 해도 괜찮나요?',
    answer: `${beginnerFact} 기초를 배우는 세미나와 스터디가 있으니 지원 안내를 살펴보세요.`,
    href: '/recruit',
    linkLabel: '지원 안내 보기',
  },
  {
    id: 'fee-room',
    question: '회비와 동아리방이 궁금해요',
    answer: `회비는 ${RECRUIT_FACTS.fee}, 동아리방은 ${RECRUIT_FACTS.room}입니다. 자세한 안내는 지원하기 페이지에서 확인해 주세요.`,
    href: '/recruit',
    linkLabel: '지원 안내 보기',
  },
] as const

export type AskFaq = (typeof ASK_FAQS)[number]
