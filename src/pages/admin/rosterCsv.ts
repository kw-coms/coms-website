import { csvCell } from './auditLogCsv'
import { formatPhoneForSheet } from './memberCsv'
import { FIRST_GENERATION_YEAR, displayStudentId } from '../../utils/roleAccess'

// The roster as a spreadsheet file, for the president's own records (checking who is still in
// the club, reconciling the list against a group chat). Built in the browser from the list
// already on screen: no request is made and nothing is stored.

type RosterRow = {
  studentId?: string | null
  name?: string | null
  generation?: string | number | null
  admissionYear?: number | null
  phone?: string | null
  initialRole?: string | null
  /** Whether an account has signed up against this row; undefined when the member list failed to load. */
  joined?: boolean
}

const HEADER = ['이름', '학번', '입학연도', '기수', '구분', '전화번호', '가입 여부', '가입 시 등급']

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

// EligibleMemberService.GRADUATE_AFTER_YEARS 와 같은 값.
const GRADUATE_AFTER_YEARS = 7

/**
 * 명부 행의 입학연도. 졸업생으로 등록된 행은 학번이 아예 없으므로(가입할 때 비로소
 * G{입학연도}-{명부번호} 가 발급된다) 학번 모양만으로는 졸업 여부를 알 수 없다.
 *
 * admission_year 를 채우지 않는 쓰기 경로가 있으므로 아래 폴백은 지우면 안 된다 —
 * MaintenanceController 부트스트랩은 학번과 이름만 쓰고, applyExactStudentIdentity 는
 * 학번이 10자리가 아니면 null 을 넣는다. 폴백 순서는 V29 백필이 쓴 것과 같다.
 */
export function rosterAdmissionYear(row: RosterRow): number | null {
  if (typeof row.admissionYear === 'number' && Number.isFinite(row.admissionYear)) return row.admissionYear
  const studentId = String(row.studentId ?? '')
  const graduate = studentId.match(/^G(\d{4})-\d+$/)
  if (graduate) return Number(graduate[1])
  if (/^\d{10}$/.test(studentId)) return Number(studentId.slice(0, 4))
  const generation = String(row.generation ?? '').replace(/[^0-9]/g, '')
  if (generation) return Number(generation) + FIRST_GENERATION_YEAR
  return null
}

/** EligibleMemberService.isGraduate 의 거울. 알 수 없으면 추측하지 않고 null 을 돌려준다. */
export function isGraduateRow(row: RosterRow, now = new Date()): boolean | null {
  const admissionYear = rosterAdmissionYear(row)
  if (admissionYear === null) return null
  return admissionYear <= now.getFullYear() - GRADUATE_AFTER_YEARS
}

/** UTF-8 with a BOM (so Excel reads the Korean text), one roster row per line, in the order given. */
export function rosterToCsv(roster: RosterRow[], now = new Date()): string {
  const rows = roster.map((member) => {
    const graduate = isGraduateRow(member, now)
    return [
      member.name,
      displayStudentId(member.studentId),
      rosterAdmissionYear(member) ?? '',
      member.generation ? `${member.generation}기` : '',
      graduate === null ? '' : graduate ? '졸업생' : '재학생',
      formatPhoneForSheet(member.phone),
      member.joined === undefined ? '' : member.joined ? '가입' : '미가입',
      member.initialRole === 'ASSOCIATE' ? '준회원' : '회원',
    ].map(csvCell).join(',')
  })
  return `${BOM}${[HEADER.map(csvCell).join(','), ...rows].join('\r\n')}`
}

/** Hands the file to the browser's own download. */
export function downloadRosterCsv(roster: RosterRow[], now = new Date()) {
  const blob = new Blob([rosterToCsv(roster, now)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `coms-roster-${now.toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
