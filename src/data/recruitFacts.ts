// What joining involves. One source for the /activities banner, /recruit and /recruit-notice.

export const RECRUIT_FACTS = {
  headline: '지금 60기 상시 모집 중',
  note: '마감 없이 받고 있고, 코딩이 처음이어도 괜찮습니다.',
  fee: '2만원',
  room: '복지관 403호',
}

export const recruitSummary = `${RECRUIT_FACTS.note} 회비는 ${RECRUIT_FACTS.fee}, 동아리방은 ${RECRUIT_FACTS.room}입니다.`

export const recruitFactRows: { label: string; value: string }[] = [
  { label: '모집', value: '60기 상시 모집, 마감 없음' },
  { label: '경험', value: '코딩이 처음이어도 괜찮아요' },
  { label: '회비', value: RECRUIT_FACTS.fee },
  { label: '동아리방', value: RECRUIT_FACTS.room },
]
