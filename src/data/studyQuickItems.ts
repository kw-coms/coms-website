import { STUDIES } from '../pages/study/studies'
import { studyOutline } from '../pages/study/studyOutline'
import { labMissions, missionUrl } from '../pages/study/exercises/labMissions'
import type { QuickItem } from '../utils/quickSearch'

// Study tracks, their chapters and the Circuit Lab missions for quick search. The Lab itself is already a page entry (navGroups). Built from small static
// modules (no lesson text, no problem statements), so the dialog opens as fast as before.

export const studyQuickItems: QuickItem[] = [
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
    hint: `Lab 미션 ${mission.level}단계`,
    path: missionUrl(mission.id),
    keywords: '회로 아두이노 미션',
  })),
]
