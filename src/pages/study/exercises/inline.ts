import { exercisesFor } from './problems'
import { readProgress } from './progress'
import { chapterOf, problemStatus } from './navigation'

/** Append owned DOM only: the trusted lesson HTML and its demos stay untouched. */
export function initExerciseLinks(root: HTMLElement, studyId: string, navigate: (path: string) => void) {
  const problems = exercisesFor(studyId)
  const owned: HTMLElement[] = []
  const listeners: (() => void)[] = []
  const link = (text: string, href: string) => {
    const a = document.createElement('a')
    a.href = href
    a.textContent = text
    const click = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(href)
    }
    a.addEventListener('click', click)
    listeners.push(() => a.removeEventListener('click', click))
    return a
  }
  const header = root.querySelector('.hero')
  if (header) {
    const a = link(studyId === 'arduino' ? '실습 미션 10개 →' : `실습 문제 ${problems.length}개 →`, `/study/${studyId}/practice`)
    a.className = 'ex-header-link'
    header.append(a)
    owned.push(a)
  }
  const progress = readProgress()
  for (const section of root.querySelectorAll<HTMLElement>('section[id]')) {
    const matches = problems.filter((p) => chapterOf(p, studyId) === section.id)
    if (!matches.length) continue
    const card = document.createElement('aside')
    card.className = 'ex-inline'
    const heading = document.createElement('h3')
    heading.textContent = '이 장의 실습 문제'
    card.append(heading)
    const list = document.createElement('ul')
    for (const p of matches) {
      const li = document.createElement('li')
      li.append(link(`${p.title} · 난이도 ${p.level} ${'●'.repeat(p.level)} · ${problemStatus(progress[p.id])}`, `/study/${studyId}/practice/${p.id}`))
      list.append(li)
    }
    card.append(list)
    section.append(card)
    owned.push(card)
  }
  return () => { listeners.forEach((remove) => remove()); owned.forEach((node) => node.remove()) }
}
