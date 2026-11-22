import type { HackathonProject, HackathonWorkWrite } from '../../services/hackathonApi'

export function workDraft(project?: HackathonProject): HackathonWorkWrite {
  return {
    title: project?.title ?? '',
    author: project?.author ?? '',
    description: project?.description ?? '',
    github: project?.github ?? null,
    live: project?.live ?? null,
    version: project?.version,
  }
}
