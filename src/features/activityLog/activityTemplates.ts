const templates = {
  seminar: { name: '세미나·스터디', sections: ['오늘 다룬 주제', '실습과 배운 점', '다음에 이어갈 내용'] },
  project: { name: '프로젝트 발표', sections: ['해결하려는 문제', '팀이 만든 결과물', '발표 피드백과 다음 단계'] },
  event: { name: '행사·모임', sections: ['모임 목적', '진행한 내용', '후기와 공유할 자료'] },
  schedule: { name: '일정 안내', sections: ['장소와 시간', '참여 대상과 방법', '준비물과 문의'] },
} as const

export function activityTemplateOptions(schedule: boolean) {
  return Object.values(templates).filter(template => (template === templates.schedule) === schedule)
}
