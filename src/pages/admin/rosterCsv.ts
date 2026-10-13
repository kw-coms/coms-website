import { csvCell } from './auditLogCsv'
import { formatPhoneForSheet } from './memberCsv'
import { displayStudentId } from '../../utils/roleAccess'

// The roster as a spreadsheet file, for the president's own records (checking who is still in
// the club, reconciling the list against a group chat). Built in the browser from the list
// already on screen: no request is made and nothing is stored.

type RosterRow = {
  studentId?: string | null
  name?: string | null
  generation?: string | number | null
  phone?: string | null
  initialRole?: string | null
  /** Whether an account has signed up against this row; undefined when the member list failed to load. */
  joined?: boolean
}

const HEADER = ['이름', '학번', '기수', '구분', '전화번호', '가입 여부', '가입 시 등급']

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

/**
 * 졸업생 행은 실제 학번 대신 합성 ID(G{입학연도}-{명부번호})를 들고 있다 — 그 모양이
 * 졸업생이라는 뜻이고, 화면과 같은 규칙(displayStudentId)으로 입학연도만 보여준다.
 */
export function isGraduateRow(studentId: unknown): boolean {
  return /^G\d{4}-\d+$/.test(String(studentId ?? ''))
}

/** UTF-8 with a BOM (so Excel reads the Korean text), one roster row per line, in the order given. */
export function rosterToCsv(roster: RosterRow[]): string {
  const rows = roster.map((member) => [
    member.name,
    displayStudentId(member.studentId),
    member.generation ? `${member.generation}기` : '',
    isGraduateRow(member.studentId) ? '졸업생' : '재학생',
    formatPhoneForSheet(member.phone),
    member.joined === undefined ? '' : member.joined ? '가입' : '미가입',
    member.initialRole === 'ASSOCIATE' ? '준회원' : '회원',
  ].map(csvCell).join(','))
  return `${BOM}${[HEADER.map(csvCell).join(','), ...rows].join('\r\n')}`
}

/** Hands the file to the browser's own download. */
export function downloadRosterCsv(roster: RosterRow[], now = new Date()) {
  const blob = new Blob([rosterToCsv(roster)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `coms-roster-${now.toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
