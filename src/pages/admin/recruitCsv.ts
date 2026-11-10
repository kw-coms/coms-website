import { csvCell } from './auditLogCsv'
import { recruitStatusLabel } from './recruitStatus'

// The loaded recruit applications as a spreadsheet file. Built in the browser from the list
// already on screen: no request is made and nothing is stored.

type ApplicationRow = {
  name?: string | null
  studentId?: string | null
  department?: string | null
  grade?: string | null
  email?: string | null
  phone?: string | null
  status?: string | null
  submittedAt?: string | null
  interests?: string | null
  motive?: string | null
  expectation?: string | null
  adminNote?: string | null
}

const HEADER = ['이름', '학번', '학과', '학년', '이메일', '전화번호', '상태', '접수일', '관심 분야', '지원 동기', '기대하는 활동', '운영 메모']

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

/** UTF-8 with a BOM (so Excel reads the Korean text), one application per line, in the order given. */
export function recruitApplicationsToCsv(applications: ApplicationRow[]): string {
  const rows = applications.map((application) => [
    application.name,
    application.studentId,
    application.department,
    application.grade,
    application.email,
    application.phone,
    recruitStatusLabel(application.status),
    application.submittedAt,
    application.interests,
    application.motive,
    application.expectation,
    application.adminNote,
  ].map(csvCell).join(','))
  return `${BOM}${[HEADER.map(csvCell).join(','), ...rows].join('\r\n')}`
}

/** Hands the file to the browser's own download. */
export function downloadRecruitApplicationsCsv(applications: ApplicationRow[], now = new Date()) {
  const blob = new Blob([recruitApplicationsToCsv(applications)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `coms-recruit-${now.toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
