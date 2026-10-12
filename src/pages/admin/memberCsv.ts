import { csvCell } from './auditLogCsv'
import { ROLE_LABELS, displayStudentId } from '../../utils/roleAccess'

// The member list as a spreadsheet file, for the president's own records (a contact list for
// an event, a roll for the semester). Built in the browser from the list already on screen:
// no request is made and nothing is stored.

type MemberRow = {
  name?: string | null
  studentId?: string | null
  generation?: string | number | null
  role?: string | null
  email?: string | null
  emailVerified?: boolean | null
  department?: string | null
  phone?: string | null
}

const HEADER = ['이름', '학번', '기수', '역할', '이메일', '이메일 인증', '학과', '전화번호']

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

/**
 * "01012345678" as "010-1234-5678". A spreadsheet reads a bare run of digits as a number and
 * drops the leading zero; with hyphens it stays text. Anything else is left as written.
 */
export function formatPhoneForSheet(phone: unknown): string {
  const text = String(phone ?? '').trim()
  const digits = text.replace(/[\s-]+/g, '')
  if (/^01\d{9}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (/^01\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return text
}

/** UTF-8 with a BOM (so Excel reads the Korean text), one member per line, in the order given. */
export function membersToCsv(members: MemberRow[]): string {
  const rows = members.map((member) => [
    member.name,
    displayStudentId(member.studentId),
    member.generation ? `${member.generation}기` : '',
    ROLE_LABELS[member.role || 'USER'] || member.role || '',
    member.email,
    member.emailVerified ? '인증' : '미인증',
    member.department,
    formatPhoneForSheet(member.phone),
  ].map(csvCell).join(','))
  return `${BOM}${[HEADER.map(csvCell).join(','), ...rows].join('\r\n')}`
}

/** Hands the file to the browser's own download. */
export function downloadMembersCsv(members: MemberRow[], now = new Date()) {
  const blob = new Blob([membersToCsv(members)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `coms-members-${now.toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
