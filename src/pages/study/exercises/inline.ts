import { exercisesFor } from './problems'
import { selectInlineProblems } from './selection'
import { readProgress } from './progress'
import { chapterOf, problemStatus } from './navigation'

/** Append owned DOM only: the trusted lesson HTML and its demos stay untouched. */
export function initExerciseLinks(root: HTMLElement, studyId: string, navigate: (path: string) => void) {
  const problems = exercisesFor(studyId)
  const owned: HTMLElement[] = []
  const listeners: (() => void)[] = []
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const link = (href: string, className: string, label: string) => {
    const a = el('a', className)
    a.href = href
    if (label) a.setAttribute('aria-label', label)
    const click = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(href)
    }
    a.addEventListener('click', click)
    listeners.push(() => a.removeEventListener('click', click))
    return a
  }
  const progress = readProgress()
  const header = root.querySelector('.hero')
  if (header) {
    const solved = problems.filter((p) => progress[p.id]?.solved).length
    const noun = studyId === 'arduino' ? '실습 미션 10개' : `실습 문제 ${problems.length}개`
    const hint = solved ? ` · ${solved}개 해결` : ''
    const a = link(`/study/${studyId}/practice`, 'ex-cta', `직접 풀고 자동 채점받기, ${noun}${hint}`)
    a.append(el('strong', undefined, '직접 풀고 자동 채점받기'), el('span', 'ex-cta-sub', noun + hint), el('span', 'ex-arrow', '→'))
    a.lastElementChild?.setAttribute('aria-hidden', 'true')
    header.append(a)
    owned.push(a)
  }
  for (const section of root.querySelectorAll<HTMLElement>('section[id]')) {
    const matches = problems.filter((p) => chapterOf(p, studyId) === section.id)
    if (!matches.length) continue
    const card = el('aside', 'ex-inline')
    const head = el('div', 'ex-inline-head')
    head.append(el('h3', undefined, '이 장의 실습 문제'))
    if (matches.length > 4) {
      const more = link(`/study/${studyId}/practice?chapter=${encodeURIComponent(section.id)}`, 'ex-inline-more', `이 장 문제 전체 ${matches.length}개 보기`)
      more.textContent = `전체 ${matches.length}개 →`
      head.append(more)
    } else head.append(el('span', 'ex-inline-count', `${matches.length}문제`))
    card.append(head)
    const list = el('ul', 'ex-inline-list')
    for (const p of selectInlineProblems(matches, progress)) {
      const status = problemStatus(progress[p.id])
      const row = link(`/study/${studyId}/practice/${p.id}`, 'ex-inline-row', `${p.title}, 난이도 ${p.level} / 5, ${status}`)
      const dots = el('span', 'ex-dots', '●'.repeat(p.level) + '○'.repeat(5 - p.level))
      dots.setAttribute('aria-hidden', 'true')
      const badge = el('span', 'ex-badge', status)
      badge.setAttribute('aria-hidden', 'true')
      if (progress[p.id]?.solved) badge.dataset.state = 'solved'
      row.append(el('strong', undefined, p.title), dots, badge)
      const li = el('li')
      li.append(row)
      list.append(li)
    }
    card.append(list)
    section.append(card)
    owned.push(card)
  }
  return () => { listeners.forEach((remove) => remove()); owned.forEach((node) => node.remove()) }
}
