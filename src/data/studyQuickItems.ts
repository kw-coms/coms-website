import { STUDIES } from '../pages/study/studies'
import { studyOutline } from '../pages/study/studyOutline'
import { labMissions, missionUrl } from '../pages/study/exercises/labMissions'
import type { QuickItem } from '../utils/quickSearch'

// Study tracks, their chapters and the Circuit Lab missions for quick search. Built from small static
// modules (no lesson text, no problem statements), so the dialog opens as fast as before.

const missionTitles = labMissions.map((mission) => mission.title).join(' ')

export const studyQuickItems: QuickItem[] = [
  {
    id: 'study:lab',
    group: 'study',
    title: '회로 시뮬레이터',
    hint: 'Circuit Lab',
    path: '/lab/',
    keywords: `circuit lab 회로 아두이노 arduino 시뮬레이터 브레드보드 부품 ${missionTitles}`,
  },
  ...STUDIES.flatMap((study) => [
    {
      id: `study:${study.id}`,
      group: 'study' as const,
      title: study.title,
      hint: study.subtitle,
      path: `/study/${study.id}`,
      keywords: `${study.description} ${study.tags.join(' ')}`,
    },
    ...(studyOutline[study.id] ?? []).map((chapter): QuickItem => ({
      id: `study:${study.id}#${chapter.id}`,
      group: 'study',
      title: chapter.title,
      hint: study.title,
      path: `/study/${study.id}#${chapter.id}`,
      keywords: `${study.title} ${study.tags.join(' ')}`,
    })),
  ]),
  ...labMissions.map((mission): QuickItem => ({
    id: `study:lab-${mission.id}`,
    group: 'study',
    title: mission.title,
    hint: `Circuit Lab 미션 ${mission.level}단계`,
    path: missionUrl(mission.id),
    keywords: '회로 아두이노 circuit lab 미션',
  })),
]
