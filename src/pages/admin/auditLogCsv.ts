// Columns of the audit-log export, in file order. Also the header row.
const AUDIT_LOG_CSV_COLUMNS = ['createdAt', 'actorName', 'actorStudentId', 'action', 'targetType', 'targetId', 'ipAddress', 'detail']

// Spreadsheet apps may run formulas after leading whitespace. Force them to text.
const FORMULA_TRIGGER = /^\s*[=+\-@]|^[\t\r]/

export function csvCell(value: unknown) {
  const text = String(value ?? '')
  const safe = FORMULA_TRIGGER.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

// Starts with the BOM: without it Excel reads the file in the system codepage and the Korean
// text comes out garbled.
export function auditLogsToCsv(logs: Record<string, unknown>[]) {
  const rows = logs.map((log) => AUDIT_LOG_CSV_COLUMNS.map((key) => csvCell(log[key] || '')).join(','))
  return `${BOM}${[AUDIT_LOG_CSV_COLUMNS.join(','), ...rows].join('\n')}`
}
