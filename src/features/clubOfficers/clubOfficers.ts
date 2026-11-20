// 역대 회장단의 순수 로직: 붙여넣기 파싱, 일괄 등록 미리보기 비교, 연대(10년 단위) 묶기, 검색.
// 화면이 상태를 들고 이 파일은 계산만 한다. tests/clubOfficers.test.mjs 가 동작을 고정한다.
// (노드 테스트가 그대로 불러오므로 다른 모듈을 import 하지 않는다.)

export type OfficerRole = 'PRESIDENT' | 'VICE_PRESIDENT'
export type OfficerView = { id: number; role: OfficerRole; name: string; generation: string | null }
export type TermView = { id: number; label: string; year: number; position: number; note: string; officers: OfficerView[] }

export type ImportRow = { label: string; year: number; presidents: string[]; vices: string[] }
export type ParseIssue = { line: number; text: string; message: string }
export type ParseResult = { rows: ImportRow[]; issues: ParseIssue[] }
export type ImportAction = 'create' | 'update' | 'same'

export const MIN_YEAR = 1900
export const MAX_YEAR = 2100
export const MAX_LABEL = 20
export const MAX_NAME = 40
export const MAX_NAMES_PER_ROLE = 10
export const MAX_IMPORT_ROWS = 500

const HEADER_YEAR = /^(연도|년도|년|year)$/i

/** "홍길동, 김철수" → ['홍길동','김철수']. 쉼표(전각 포함) 앞뒤 공백은 무시하고 중복은 한 번만. */
export function splitNames(cell: string): string[] {
  const names: string[] = []
  for (const part of cell.split(/[,，、]/)) {
    const name = part.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** 탭이 있으면 탭으로, 없으면 공백 2칸 이상으로 칸을 나눈다(스프레드시트 복사 / 손으로 정렬한 글). */
export function splitCells(line: string): string[] {
  return (line.includes('\t') ? line.split('\t') : line.trim().split(/ {2,}/)).map((cell) => cell.trim())
}

/**
 * 한 줄에 한 임기: `임기<탭>연도<탭>회장들<탭>부회장들`. 부회장은 비워도 된다.
 * 잘못된 줄은 issues 로 모으고 나머지 줄만 rows 로 돌려준다.
 */
export function parseOfficerPaste(text: string): ParseResult {
  const rows: ImportRow[] = []
  const issues: ParseIssue[] = []
  const seen = new Map<string, number>()
  const lines = String(text ?? '').split(/\r\n|\r|\n/)
  lines.forEach((raw, index) => {
    if (!raw.trim()) return
    const line = index + 1
    const fail = (message: string) => { issues.push({ line, text: raw.trim(), message }) }
    const cells = splitCells(raw)
    // 첫 줄이 "임기 연도 회장 부회장" 머리글이면 건너뛴다.
    if (rows.length === 0 && issues.length === 0 && HEADER_YEAR.test(cells[1] ?? '')) return
    if (cells.length < 3) return fail('칸이 부족합니다. 임기, 연도, 회장, 부회장 순서로 탭이나 공백 2칸 이상으로 나눠 주세요.')
    if (cells.length > 4) return fail('칸이 너무 많습니다. 임기, 연도, 회장, 부회장 4칸까지만 쓸 수 있습니다.')
    const [label, yearCell, presidentCell, viceCell = ''] = cells
    if (!label) return fail('임기 이름이 비어 있습니다.')
    if (label.length > MAX_LABEL) return fail(`임기 이름은 ${MAX_LABEL}자까지 입력할 수 있습니다.`)
    const year = /^\d{4}\s*년?$/.test(yearCell) ? Number(yearCell.replace(/\D/g, '')) : NaN
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return fail(`연도는 ${MIN_YEAR}~${MAX_YEAR} 사이 4자리 숫자여야 합니다.`)
    const presidents = splitNames(presidentCell)
    const vices = splitNames(viceCell)
    if (presidents.length === 0 && vices.length === 0) return fail('회장과 부회장 이름이 모두 비어 있습니다.')
    for (const [title, names] of [['회장', presidents], ['부회장', vices]] as const) {
      if (names.length > MAX_NAMES_PER_ROLE) return fail(`${title}은(는) ${MAX_NAMES_PER_ROLE}명까지 입력할 수 있습니다.`)
      if (names.some((name) => name.length > MAX_NAME)) return fail(`${title} 이름은 ${MAX_NAME}자까지 입력할 수 있습니다.`)
    }
    if (seen.has(label)) return fail(`임기 이름 '${label}'이(가) ${seen.get(label)}번째 줄과 겹칩니다.`)
    seen.set(label, line)
    rows.push({ label, year, presidents, vices })
  })
  if (rows.length > MAX_IMPORT_ROWS) {
    issues.push({ line: 0, text: '', message: `한 번에 ${MAX_IMPORT_ROWS}개 임기까지 등록할 수 있습니다.` })
  }
  return { rows, issues }
}

const namesOf = (officers: { role: string; name: string }[], role: OfficerRole) =>
  officers.filter((officer) => officer.role === role).map((officer) => officer.name)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index])

/** 붙여넣은 줄이 지금 목록에 비해 새 임기인지, 바뀌는지, 같은지. 같은 임기 이름이 기준이다(서버와 같은 규칙). */
export function importAction(row: ImportRow, existing: { label: string; year: number; officers: { role: string; name: string }[] }[]): ImportAction {
  const current = existing.find((term) => term.label === row.label)
  if (!current) return 'create'
  const same = current.year === row.year
    && sameList(namesOf(current.officers, 'PRESIDENT'), row.presidents)
    && sameList(namesOf(current.officers, 'VICE_PRESIDENT'), row.vices)
  return same ? 'same' : 'update'
}

export const IMPORT_ACTION_LABEL: Record<ImportAction, string> = { create: '새로 추가', update: '수정', same: '변경 없음' }

/** 서버가 내려주는 기수 값은 '50' 이지만 '50기' 로 적힌 명부도 있다. 어느 쪽이든 '50기'. */
export function generationLabel(generation: string | null | undefined): string {
  const text = String(generation ?? '').trim().replace(/기$/, '')
  return text ? `${text}기` : ''
}

export type DecadeGroup = { decade: number; title: string; terms: TermView[] }

/** 연도 내림차순으로 온 임기를 10년 단위로 묶는다(2020년대, 2010년대 …). 입력 순서를 그대로 지킨다. */
export function groupByDecade(terms: TermView[]): DecadeGroup[] {
  const groups: DecadeGroup[] = []
  for (const term of terms) {
    const decade = Math.floor(term.year / 10) * 10
    let group = groups.find((item) => item.decade === decade)
    if (!group) {
      group = { decade, title: `${decade}년대`, terms: [] }
      groups.push(group)
    }
    group.terms.push(term)
  }
  return groups
}

const keyOf = (value: unknown) => String(value ?? '').toLowerCase().replace(/[\s-]+/g, '')

/** 이름·연도·임기 이름·기수 중 하나에 검색어의 모든 단어가 들어 있으면 통과. 빈 검색어는 전부 통과. */
export function termMatches(query: string, term: TermView): boolean {
  const words = String(query ?? '').split(/\s+/).map(keyOf).filter(Boolean)
  if (words.length === 0) return true
  const fields = [
    term.label, term.year, `${term.year}년`, term.note,
    ...term.officers.flatMap((officer) => [officer.name, officer.generation, generationLabel(officer.generation)]),
  ].map(keyOf)
  return words.every((word) => fields.some((field) => field.includes(word)))
}
